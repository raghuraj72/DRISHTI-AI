"""DRISHTI-AI — Full verification script"""
import os, sys
os.chdir(r"C:\Users\RAGHURAJ P SINGH\OneDrive\Desktop\DTU\DRISHTI-AI")
sys.path.insert(0, ".")

from dotenv import load_dotenv
load_dotenv()

# ── 1. Credential check ───────────────────────────────────────
print("=== Credential Check ===")
keys = ["GEMINI_API_KEY","AISSTREAM_API_KEY","SENTINEL_CLIENT_ID","OPENSKY_USERNAME","VITE_MAPBOX_TOKEN","GEMINI_MODEL"]
for k in keys:
    v = os.getenv(k)
    status = "SET (%s...)" % v[:10] if v else "MISSING"
    print(f"  {k}: {status}")

# ── 2. Import checks ─────────────────────────────────────────
print("\n=== Import Checks ===")
mods = {
    "ingestion.seismic.usgs_seismic": "USGSSeismicIngestion",
    "ingestion.geospatial.osm_loader": "OSMLoader",
    "ingestion.airtraffic.opensky_ingestion": "OpenSkyIngestion",
    "ingestion.maritime.ais_stream": "AISStreamIngestion",
}
for mod, cls in mods.items():
    try:
        m = __import__(mod, fromlist=[cls])
        getattr(m, cls)
        print(f"  PASS: {mod}.{cls}")
    except Exception as e:
        print(f"  FAIL: {mod} — {e}")

# ── 3. Gemini API (new SDK) ────────────────────────────────────
print("\n=== Gemini API Test (google-genai SDK) ===")
try:
    from google import genai
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    response = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        contents="Reply with exactly: DRISHTI-AI ONLINE"
    )
    print(f"  PASS: {response.text.strip()}")
except Exception as e:
    print(f"  FAIL: {e}")
    # Try listing available models to help diagnose
    try:
        from google import genai as g2
        c2 = g2.Client(api_key=os.getenv("GEMINI_API_KEY"))
        models = list(c2.models.list())
        flash_models = [m.name for m in models if "flash" in m.name.lower()][:5]
        print(f"  Available flash models: {flash_models}")
    except Exception as e2:
        print(f"  Cannot list models: {e2}")

# ── 4. USGS Live API ─────────────────────────────────────────
print("\n=== USGS Seismic Live API ===")
try:
    import requests
    r = requests.get(
        "https://earthquake.usgs.gov/fdsnws/event/1/query",
        params={"format":"geojson","minmagnitude":1,"maxlatitude":36,"minlatitude":23,"maxlongitude":80,"minlongitude":68,"limit":3,"orderby":"time"},
        timeout=15
    )
    data = r.json()
    count = len(data.get("features", []))
    print(f"  PASS: {count} seismic events fetched from USGS (Indian border region)")
except Exception as e:
    print(f"  FAIL: {e}")

print("\n=== Done ===")
