"""
DRISHTI-AI — Ingestion Stream Manager
Orchestrates all 5 ingestion modules as concurrent asyncio tasks.
Acts as the central Kafka producer hub with health check endpoint.
"""
from __future__ import annotations

import asyncio
import json
import os
import signal
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

from dotenv import load_dotenv
from loguru import logger

import sys, pathlib
# Allow running both as `python stream_manager.py` (standalone) and as a package
_here = pathlib.Path(__file__).parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))

from airtraffic.opensky_ingestion import OpenSkyIngestion  # noqa: E402
from maritime.ais_stream import AISStreamIngestion         # noqa: E402
from seismic.usgs_seismic import USGSSeismicIngestion      # noqa: E402
from satellite.sentinel2_ingestion import Sentinel2Ingestion  # noqa: E402

load_dotenv()

HEALTH_PORT = int(os.getenv("INGESTION_HEALTH_PORT", "8090"))

# ── Health Check HTTP Server ──────────────────────────────────

_status: dict = {"running": False, "modules": {}, "started_at": ""}


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = json.dumps(_status).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress default access logs


def _start_health_server():
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler)
    logger.info(f"Health check server started on port {HEALTH_PORT}")
    server.serve_forever()


# ── Stream Manager ────────────────────────────────────────────

class StreamManager:
    """
    Orchestrates all DRISHTI-AI ingestion modules as concurrent async tasks.
    Provides graceful startup, shutdown, and health monitoring.
    """

    def __init__(self):
        self._tasks: list[asyncio.Task] = []
        self._opensky = OpenSkyIngestion()
        self._ais = AISStreamIngestion()
        self._seismic = USGSSeismicIngestion()
        self._sentinel = Sentinel2Ingestion()
        self._running = False

    async def start_all(self):
        """Start all ingestion modules as concurrent async tasks."""
        self._running = True
        _status["running"] = True
        _status["started_at"] = datetime.now(timezone.utc).isoformat()

        logger.info("Starting all DRISHTI-AI ingestion modules...")

        # Start health server in background thread
        health_thread = Thread(target=_start_health_server, daemon=True)
        health_thread.start()

        # Launch each ingestion module as async task
        self._tasks = [
            asyncio.create_task(self._run_opensky(), name="opensky"),
            asyncio.create_task(self._run_ais(), name="ais"),
            asyncio.create_task(self._run_seismic(), name="seismic"),
            asyncio.create_task(self._run_sentinel(), name="sentinel"),
        ]

        logger.info(f"All {len(self._tasks)} ingestion modules started.")
        _status["modules"] = {
            "opensky": "running",
            "ais": "running",
            "seismic": "running",
            "sentinel": "running",
        }

        # Wait for all tasks (run until shutdown)
        try:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        except asyncio.CancelledError:
            logger.info("Stream manager received cancellation.")

    async def stop_all(self):
        """Gracefully stop all ingestion modules."""
        logger.info("Stopping all ingestion modules...")
        self._running = False

        self._opensky.stop()
        self._ais.stop()
        self._seismic.stop()

        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

        _status["running"] = False
        _status["modules"] = {k: "stopped" for k in _status["modules"]}
        logger.info("All ingestion modules stopped.")

    async def _run_opensky(self):
        """Wrapper with error recovery for OpenSky."""
        while self._running:
            try:
                await self._opensky.run_async()
            except Exception as e:
                logger.error(f"OpenSky module crashed: {e}. Restarting in 30s...")
                _status["modules"]["opensky"] = f"restarting: {e}"
                await asyncio.sleep(30)
                self._opensky = OpenSkyIngestion()
                _status["modules"]["opensky"] = "running"

    async def _run_ais(self):
        """Wrapper with error recovery for AIS stream."""
        while self._running:
            try:
                await self._ais.run()
            except Exception as e:
                logger.error(f"AIS module crashed: {e}. Restarting in 30s...")
                _status["modules"]["ais"] = f"restarting: {e}"
                await asyncio.sleep(30)
                self._ais = AISStreamIngestion()
                _status["modules"]["ais"] = "running"

    async def _run_seismic(self):
        """Wrapper for seismic polling."""
        while self._running:
            try:
                await self._seismic.run_async()
            except Exception as e:
                logger.error(f"Seismic module crashed: {e}. Restarting in 60s...")
                _status["modules"]["seismic"] = f"restarting: {e}"
                await asyncio.sleep(60)
                self._seismic = USGSSeismicIngestion()
                _status["modules"]["seismic"] = "running"

    async def _run_sentinel(self):
        """Sentinel-2 runs on a slow schedule (every 6h)."""
        loop = asyncio.get_event_loop()
        while self._running:
            try:
                await loop.run_in_executor(None, self._sentinel.schedule_fetch, 6)
            except Exception as e:
                logger.error(f"Sentinel-2 module crashed: {e}. Restarting in 300s...")
                _status["modules"]["sentinel"] = f"restarting: {e}"
                await asyncio.sleep(300)
                self._sentinel = Sentinel2Ingestion()
                _status["modules"]["sentinel"] = "running"


# ── Entry Point ───────────────────────────────────────────────

async def main():
    manager = StreamManager()

    loop = asyncio.get_running_loop()

    def _shutdown():
        logger.info("Shutdown signal received.")
        asyncio.create_task(manager.stop_all())

    loop.add_signal_handler(signal.SIGTERM, _shutdown)
    loop.add_signal_handler(signal.SIGINT, _shutdown)

    await manager.start_all()


if __name__ == "__main__":
    logger.info("DRISHTI-AI Stream Manager starting...")
    asyncio.run(main())
