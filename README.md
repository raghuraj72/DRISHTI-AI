# DRISHTI-AI 🛡️
### Multi-Modal Intelligence Fusion System for Real-Time Border Threat Detection

> **SEVA FIRST – Rashtriya Youth Innovation Challenge (RYIC) 2026**  
> Theme 1: National Level Innovation | Defence, Intelligence, Space & National Security  
> Team: DTU | Starting TRL: 4–5 → Target TRL: 7–9

---

## 🎯 What is DRISHTI-AI?

DRISHTI-AI is a real-time, AI-powered border surveillance intelligence platform that fuses data from **7 live sensor modalities** into a unified threat assessment dashboard. It compresses India's border intelligence OODA loop from minutes to seconds.

```
Live Data Streams → Edge AI → Fusion Engine → Threat Score → Command Dashboard
```

### Key Capabilities
| Capability | Description |
|---|---|
| 🛰️ Satellite Change Detection | Live Sentinel-2 + ISRO Bhuvan imagery analysis |
| ✈️ Air Traffic Monitoring | Real-time ADS-B via OpenSky Network |
| 🚢 Maritime Surveillance | Live AIS vessel tracking via aisstream.io |
| 🌍 Seismic Anomaly Detection | USGS real-time seismic feed for Himalayan region |
| 📹 Video Intelligence | YOLOv8 trained on VIRAT + DOTA datasets |
| 🧠 Multi-Modal AI Fusion | Cross-attention Transformer fusing all streams |
| 🗺️ Command Dashboard | Real-time React + Mapbox GL threat map |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              LIVE DATA SOURCES                      │
│  Sentinel-2 │ Bhuvan │ OpenSky │ AISstream │ USGS  │
└──────────────────────┬──────────────────────────────┘
                       │  Apache Kafka
┌──────────────────────▼──────────────────────────────┐
│           INGESTION LAYER (Python/asyncio)           │
│   7 async ingestion modules → Kafka topics           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              ML PIPELINE                            │
│  YOLOv8 Detection → LSTM Anomaly → Fusion Engine   │
│  Kalman + GNN Trajectory Prediction                 │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│         BACKEND API (FastAPI + PostGIS)             │
│  REST API + WebSocket live feed + Alert Engine      │
│  Gemini-powered Situation Reports                   │
└──────────────────────┬──────────────────────────────┘
                       │  WebSocket
┌──────────────────────▼──────────────────────────────┐
│       COMMAND DASHBOARD (React + Mapbox GL)         │
│  Live threat map │ Alert panel │ Situation reports  │
└─────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
DRISHTI-AI/
├── ingestion/                  # Data ingestion layer (7 modalities)
│   ├── satellite/              # Sentinel-2, ISRO Bhuvan
│   ├── airtraffic/             # OpenSky Network ADS-B
│   ├── maritime/               # AISstream.io
│   ├── seismic/                # USGS FDSN API
│   ├── geospatial/             # OSM, SRTM DEM
│   └── stream_manager.py       # Kafka orchestrator
├── detection/                  # ML object detection
│   ├── dataset_prep.py         # VIRAT + DOTA + UCF-Crime prep
│   ├── train_yolo.py           # YOLOv8 fine-tuning
│   ├── detector.py             # Inference engine
│   └── anomaly_detector.py     # LSTM Autoencoder
├── fusion/
│   └── fusion_engine.py        # Multi-modal Transformer fusion
├── trajectory/
│   └── kalman_predictor.py     # Kalman + GNN prediction
├── backend/                    # FastAPI backend
│   ├── main.py
│   ├── models.py
│   ├── kafka_consumer.py
│   ├── alert_engine.py
│   └── routers/
├── database/
│   └── init.sql                # PostGIS schema
├── dashboard/                  # React + Mapbox GL frontend
│   └── src/
├── mlops/                      # MLflow tracking
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Docker + Docker Compose
- Python 3.12+
- Node.js 20+
- GPU recommended for training (CUDA 12+)

### 1. Clone & Configure
```bash
git clone <repo>
cd DRISHTI-AI
cp .env.example .env
# Fill in your API keys (see .env.example for details)
```

### 2. Start Infrastructure
```bash
docker-compose up -d postgres redis zookeeper kafka mlflow
```

### 3. Initialise Database
```bash
docker exec -i drishti-postgres psql -U drishti -d drishti_db < database/init.sql
```

### 4. Start Ingestion Layer
```bash
cd ingestion
pip install -r requirements.txt
python stream_manager.py
```

### 5. Run ML Pipeline
```bash
cd detection
pip install -r requirements.txt
# Prepare datasets (first time only — downloads ~20GB)
python dataset_prep.py
# Train YOLOv8 (GPU recommended)
python train_yolo.py
```

### 6. Start Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 7. Start Dashboard
```bash
cd dashboard
npm install
npm run dev  # Opens at http://localhost:3000
```

---

## 🗄️ Real Data Sources

| Modality | Source | API | Free? |
|---|---|---|---|
| Satellite | ESA Sentinel-2 | Copernicus Data Space | ✅ Free |
| Satellite | ISRO Bhuvan | Bhuvan OGC WMS | ✅ Free |
| Air Traffic | OpenSky Network | REST + OAuth2 | ✅ Research |
| Maritime | aisstream.io | WebSocket | ✅ Free tier |
| Seismic | USGS FDSN | REST (no auth) | ✅ Fully open |
| Radar | Open Radar Initiative | GitHub datasets | ✅ Open source |
| Geospatial | OpenStreetMap + SRTM | Overpass API + NASA | ✅ Free |

---

## 🧠 ML Models

| Model | Architecture | Dataset | Purpose |
|---|---|---|---|
| Object Detector | YOLOv8m → ONNX | VIRAT v2 + DOTA v2 | Person/vehicle/aircraft detection |
| Anomaly Detector | LSTM Autoencoder | Historical sensor data | Time-series anomaly scoring |
| Fusion Engine | ViT + Cross-Attention | Multi-modal events | Threat score computation |
| Trajectory | Kalman + GNN | Tracked entities | 15-min position prediction |
| Situation Reports | Gemini 1.5 Flash | Threat context | NL briefing generation |

---

## 📊 TRL Roadmap

| TRL | Status | Milestone |
|---|---|---|
| TRL 4 | ✅ Current | Lab prototype — core models trained on real datasets |
| TRL 5 | 🔄 In Progress | Simulated environment testing with live API feeds |
| TRL 6 | 🎯 Next | Relevant environment demo — docker-compose deployment |
| TRL 7 | 📅 Planned | Field test with BSF/DRDO lab collaboration |
| TRL 8 | 📅 Planned | Qualified system — security audit, red team |
| TRL 9 | 🏆 Goal | Operational deployment |

---

## 🏛️ RYIC Compliance

- **Challenge:** SEVA FIRST – RYIC 2026
- **Theme:** Theme 1 — National Level Innovation
- **Category:** Defence, Intelligence, Space & National Security
- **Institution:** Delhi Technological University (DTU)
- **Innovation:** Proposed by team (self-identified problem)
- **Beneficiaries:** BSF, Indian Army, MHA, Indian Navy (coastal)
- **Scalability:** Containerised, horizontally scalable to all 15,000+ km border
