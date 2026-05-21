from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='../frontend/build', static_url_path='/')
CORS(app)

# ─── Open-Meteo API Configuration ───────────────────────────────────────────
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HISTORICAL_URL = "https://archive-api.open-meteo.com/v1/archive"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

# Hourly variables we request for soil & weather data
HOURLY_FORECAST_VARS = ",".join([
    "soil_moisture_0_to_1cm",
    "soil_moisture_1_to_3cm",
    "soil_moisture_3_to_9cm",
    "soil_moisture_9_to_27cm",
    "soil_moisture_27_to_81cm",
    "soil_temperature_0cm",
    "soil_temperature_6cm",
    "soil_temperature_18cm",
    "soil_temperature_54cm",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "windspeed_10m",
    "evapotranspiration",
])

# Historical archive uses different depth names (ERA5-Land reanalysis)
HOURLY_HISTORICAL_VARS = ",".join([
    "soil_moisture_0_to_7cm",
    "soil_moisture_7_to_28cm",
    "soil_moisture_28_to_100cm",
    "soil_moisture_100_to_255cm",
    "soil_temperature_0_to_7cm",
    "soil_temperature_7_to_28cm",
    "soil_temperature_28_to_100cm",
    "soil_temperature_100_to_255cm",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "windspeed_10m",
    "et0_fao_evapotranspiration",
])

DAILY_VARS = ",".join([
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "et0_fao_evapotranspiration",
])


def _avg(values):
    """Return the average of a list, ignoring None values."""
    clean = [v for v in values if v is not None]
    return round(sum(clean) / len(clean), 4) if clean else None


def _sum(values):
    """Return the sum of a list, ignoring None values."""
    clean = [v for v in values if v is not None]
    return round(sum(clean), 2) if clean else None


def _build_daily_summary(hourly_data):
    """
    Collapse hourly arrays into daily averages.
    Returns a list of dicts, one per day.
    """
    times = hourly_data.get("time", [])
    if not times:
        return []

    # Group indices by date
    day_groups = {}
    for i, t in enumerate(times):
        day = t[:10]  # "YYYY-MM-DD"
        day_groups.setdefault(day, []).append(i)

    keys = [k for k in hourly_data if k != "time"]
    summaries = []
    for day, indices in sorted(day_groups.items()):
        row = {"date": day}
        for key in keys:
            vals = [hourly_data[key][i] for i in indices]
            if "precipitation" in key or "evapotranspiration" in key:
                row[key] = _sum(vals)
            else:
                row[key] = _avg(vals)
        summaries.append(row)
    return summaries


def _generate_recommendations(current):
    """Generate farmer-friendly tips based on current conditions."""
    tips = []

    # Soil moisture recommendations
    sm_surface = current.get("soil_moisture_0_to_1cm") or current.get("soil_moisture_0_to_7cm")
    if sm_surface is not None:
        if sm_surface < 0.10:
            tips.append({
                "icon": "💧",
                "type": "warning",
                "title": "Very Dry Soil Surface",
                "text": "Surface soil moisture is critically low. Immediate irrigation is recommended, especially for shallow-rooted crops and seedlings."
            })
        elif sm_surface < 0.15:
            tips.append({
                "icon": "🚿",
                "type": "caution",
                "title": "Dry Soil — Consider Irrigation",
                "text": "Soil moisture is below optimal. Schedule irrigation within the next 24–48 hours to prevent crop stress."
            })
        elif sm_surface > 0.35:
            tips.append({
                "icon": "🌊",
                "type": "info",
                "title": "High Soil Moisture",
                "text": "Soil is well saturated. Avoid irrigation to prevent waterlogging and root diseases. Ensure proper drainage."
            })
        else:
            tips.append({
                "icon": "✅",
                "type": "good",
                "title": "Healthy Soil Moisture",
                "text": "Soil moisture levels are in the optimal range for most crops. Continue monitoring."
            })

    # Temperature recommendations
    temp = current.get("temperature_2m")
    if temp is not None:
        if temp > 38:
            tips.append({
                "icon": "🔥",
                "type": "warning",
                "title": "Extreme Heat Alert",
                "text": f"Air temperature is {temp}°C. Apply mulch to conserve moisture, provide shade for sensitive crops, and irrigate during early morning or evening."
            })
        elif temp < 5:
            tips.append({
                "icon": "❄️",
                "type": "warning",
                "title": "Frost Risk",
                "text": f"Air temperature is {temp}°C. Protect sensitive crops with covers. Avoid planting warm-season crops until conditions improve."
            })

    # Precipitation
    precip = current.get("precipitation")
    if precip is not None and precip > 5:
        tips.append({
            "icon": "🌧️",
            "type": "caution",
            "title": "Heavy Rainfall",
            "text": f"Precipitation of {precip} mm detected. Delay fertilizer and pesticide applications. Check drainage systems."
        })

    # Wind
    wind = current.get("windspeed_10m")
    if wind is not None and wind > 40:
        tips.append({
            "icon": "💨",
            "type": "caution",
            "title": "High Winds",
            "text": f"Wind speed is {wind} km/h. Avoid spraying pesticides. Stake tall crops and check greenhouse structures."
        })

    # Evapotranspiration
    et = current.get("evapotranspiration") or current.get("et0_fao_evapotranspiration")
    if et is not None and et > 0.5:
        tips.append({
            "icon": "☀️",
            "type": "info",
            "title": "High Evapotranspiration",
            "text": "Water loss from soil is elevated. Increase irrigation frequency, especially for crops with high water demand."
        })

    # Soil temperature
    soil_temp = current.get("soil_temperature_6cm") or current.get("soil_temperature_0_to_7cm")
    if soil_temp is not None:
        if soil_temp < 10:
            tips.append({
                "icon": "🌱",
                "type": "info",
                "title": "Cool Soil — Slow Germination",
                "text": f"Soil temperature at depth is {soil_temp}°C. Seed germination will be slow. Consider waiting for warmer conditions to plant warm-season crops."
            })
        elif soil_temp > 25:
            tips.append({
                "icon": "🌡️",
                "type": "info",
                "title": "Warm Soil — Ideal for Growth",
                "text": f"Soil temperature at depth is {soil_temp}°C. Conditions are ideal for most warm-season crops."
            })

    if not tips:
        tips.append({
            "icon": "👍",
            "type": "good",
            "title": "Conditions Look Good",
            "text": "No immediate concerns detected. Continue routine farm management."
        })

    return tips


# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.errorhandler(404)
def not_found(e):
    return app.send_static_file('index.html')

@app.route('/api/forecast', methods=['GET'])
def get_forecast():
    """
    Fetch 7-day forecast with soil moisture, soil temperature, and weather.
    Query params: lat, lon
    """
    lat = request.args.get('lat')
    lon = request.args.get('lon')

    if not lat or not lon:
        return jsonify({"error": "lat and lon are required"}), 400

    try:
        resp = requests.get(FORECAST_URL, params={
            "latitude": lat,
            "longitude": lon,
            "hourly": HOURLY_FORECAST_VARS,
            "daily": DAILY_VARS,
            "timezone": "auto",
            "forecast_days": 7,
        }, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        # Build daily summaries from hourly data
        hourly = data.get("hourly", {})
        daily_raw = data.get("daily", {})
        daily_summary = _build_daily_summary(hourly)

        # Merge the official daily aggregates
        if daily_raw.get("time"):
            for i, day in enumerate(daily_raw["time"]):
                for s in daily_summary:
                    if s["date"] == day:
                        s["temperature_2m_max"] = daily_raw.get("temperature_2m_max", [None])[i]
                        s["temperature_2m_min"] = daily_raw.get("temperature_2m_min", [None])[i]
                        s["precipitation_sum"] = daily_raw.get("precipitation_sum", [None])[i]
                        s["et0_fao_evapotranspiration_daily"] = daily_raw.get("et0_fao_evapotranspiration", [None])[i]

        # Current conditions = today's average (first day)
        current = daily_summary[0] if daily_summary else {}
        recommendations = _generate_recommendations(current)

        return jsonify({
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "elevation": data.get("elevation"),
            "timezone": data.get("timezone"),
            "current": current,
            "daily": daily_summary,
            "recommendations": recommendations,
            "units": data.get("hourly_units", {}),
        })

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch data from Open-Meteo: {str(e)}"}), 502


@app.route('/api/historical', methods=['GET'])
def get_historical():
    """
    Fetch historical soil & weather data for a specific date or date range.
    Query params: lat, lon, date (or start_date & end_date)
    """
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    date = request.args.get('date')
    start_date = request.args.get('start_date', date)
    end_date = request.args.get('end_date', date)

    if not lat or not lon:
        return jsonify({"error": "lat and lon are required"}), 400
    if not start_date or not end_date:
        return jsonify({"error": "date (or start_date & end_date) is required"}), 400

    try:
        resp = requests.get(HISTORICAL_URL, params={
            "latitude": lat,
            "longitude": lon,
            "start_date": start_date,
            "end_date": end_date,
            "hourly": HOURLY_HISTORICAL_VARS,
            "daily": DAILY_VARS,
            "timezone": "auto",
        }, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        hourly = data.get("hourly", {})
        daily_raw = data.get("daily", {})
        daily_summary = _build_daily_summary(hourly)

        # Merge official daily aggregates
        if daily_raw.get("time"):
            for i, day in enumerate(daily_raw["time"]):
                for s in daily_summary:
                    if s["date"] == day:
                        s["temperature_2m_max"] = daily_raw.get("temperature_2m_max", [None])[i]
                        s["temperature_2m_min"] = daily_raw.get("temperature_2m_min", [None])[i]
                        s["precipitation_sum"] = daily_raw.get("precipitation_sum", [None])[i]
                        s["et0_fao_evapotranspiration_daily"] = daily_raw.get("et0_fao_evapotranspiration", [None])[i]

        current = daily_summary[0] if daily_summary else {}
        recommendations = _generate_recommendations(current)

        return jsonify({
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "elevation": data.get("elevation"),
            "timezone": data.get("timezone"),
            "current": current,
            "daily": daily_summary,
            "recommendations": recommendations,
            "units": data.get("hourly_units", {}),
        })

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch historical data: {str(e)}"}), 502


@app.route('/api/geocode', methods=['GET'])
def geocode():
    """
    Convert a place name to latitude/longitude using Open-Meteo Geocoding API.
    Query params: name
    """
    name = request.args.get('name')
    if not name:
        return jsonify({"error": "name is required"}), 400

    try:
        resp = requests.get(GEOCODE_URL, params={
            "name": name,
            "count": 5,
            "language": "en",
            "format": "json",
        }, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        results = []
        for r in data.get("results", []):
            results.append({
                "name": r.get("name"),
                "country": r.get("country", ""),
                "admin1": r.get("admin1", ""),
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
                "elevation": r.get("elevation"),
                "display": f"{r.get('name')}, {r.get('admin1', '')}, {r.get('country', '')}".strip(", "),
            })

        return jsonify({"results": results})

    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Geocoding failed: {str(e)}"}), 502


@app.route('/api/health', methods=['GET'])
def health():
    """Simple health check endpoint."""
    return jsonify({"status": "ok", "api": "Open-Meteo (Free, No Key Required)"})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
