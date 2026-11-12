/*
  CCTV Health Monitoring System
  ESP32 + INA219 + MPU6050 + DS18B20 + Water Level Sensor

  Monitors the health of a CCTV camera installation:
    - Supply voltage / current / power      (INA219)
    - Tamper: tilt, rotation, vibration     (MPU6050)
    - Housing temperature                   (DS18B20)
    - Water ingress in housing              (Water level sensor)

  Serves a live web dashboard on the ESP32's IP address.

  Libraries required (Library Manager):
    Adafruit INA219
    OneWire
    DallasTemperature
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------------- USER SETTINGS ----------------
const char* WIFI_SSID = "Airtel_nive_2323_5G";
const char* WIFI_PASS = "Airtel@1234";

// Backend FastAPI Configuration
// When running locally, set BACKEND_HOST to your PC's IP on Wi-Fi (e.g. 192.168.1.4)
const char* BACKEND_HOST = "192.168.1.6";
const int   BACKEND_PORT = 8000;
const char* TELEMETRY_PATH = "/cameras/telemetry";
const char* API_KEY = "ESP32_SECRET_KEY"; // Must match API_KEY in backend/.env
const char* DEVICE_ID = "ABCD";           // Must match registered camera device_id
const unsigned long TELEMETRY_INTERVAL_MS = 30000; // Transmit telemetry once every 30 seconds

// Thresholds
const float V_MIN_FAULT   = 11.0;   // V
const float V_MIN_WARN    = 11.5;   // V
const float V_MAX_WARN    = 13.5;   // V
const float I_MIN_ON      = 20.0;   // mA - below this camera is considered dead
const float I_MAX_WARN    = 900.0;  // mA
const float I_MAX_FAULT   = 1200.0; // mA
const float T_WARN        = 60.0;   // degC
const float T_FAULT       = 70.0;   // degC
const int   WATER_WARN    = 4100;   // raw ADC - 4068 is normal baseline; warn if >4100
const int   WATER_FAULT   = 4200;   // raw ADC - minor issue threshold
const float TILT_WARN     = 7.0;    // degrees from baseline
const float TILT_FAULT    = 15.0;   // degrees from baseline
const float SHOCK_G       = 1.6;    // g - impact detection
// -----------------------------------------------

// Pins
#define PIN_ONEWIRE   4
#define PIN_WATER_ADC 34
#define PIN_WATER_PWR 25
#define PIN_BUZZER    13
#define PIN_LED       2

#define MPU_ADDR 0x68

Adafruit_INA219 ina219;
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds18b20(&oneWire);
WebServer server(80);

// Live readings
float busVoltage = 0, current_mA = 0, power_mW = 0;
float tempC = 0;
int   waterRaw = 0;
float pitch = 0, roll = 0, accelMag = 0;
float basePitch = 0, baseRoll = 0;
float tiltDev = 0;
bool  shockFlag = false;
unsigned long shockTime = 0;

String stPower = "OK", stTemp = "OK", stWater = "OK", stTamper = "OK";
String overall = "HEALTHY";

unsigned long lastRead = 0;
unsigned long bootTime = 0;

// ---------------- MPU6050 (direct register access) ----------------
void mpuInit() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);          // PWR_MGMT_1
  Wire.write(0x00);          // wake up
  Wire.endTransmission(true);

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C);          // ACCEL_CONFIG
  Wire.write(0x00);          // +/- 2g
  Wire.endTransmission(true);
}

void mpuRead() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();

  float gx = ax / 16384.0;
  float gy = ay / 16384.0;
  float gz = az / 16384.0;

  accelMag = sqrt(gx * gx + gy * gy + gz * gz);
  pitch = atan2(gy, sqrt(gx * gx + gz * gz)) * 180.0 / PI;
  roll  = atan2(-gx, gz) * 180.0 / PI;
}

void captureBaseline() {
  float sp = 0, sr = 0;
  for (int i = 0; i < 20; i++) {
    mpuRead();
    sp += pitch;
    sr += roll;
    delay(25);
  }
  basePitch = sp / 20.0;
  baseRoll  = sr / 20.0;
}

// ---------------- Water level ----------------
int readWater() {
  digitalWrite(PIN_WATER_PWR, HIGH);   // power only while reading
  delay(50);
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(PIN_WATER_ADC);
    delay(5);
  }
  digitalWrite(PIN_WATER_PWR, LOW);
  return sum / 10;
}

// ---------------- Health evaluation ----------------
void evaluateHealth() {
  // Power
  if (busVoltage < V_MIN_FAULT)            stPower = "FAULT";
  else if (current_mA < I_MIN_ON)          stPower = "FAULT";
  else if (current_mA > I_MAX_FAULT)       stPower = "FAULT";
  else if (busVoltage < V_MIN_WARN)        stPower = "WARN";
  else if (busVoltage > V_MAX_WARN)        stPower = "WARN";
  else if (current_mA > I_MAX_WARN)        stPower = "WARN";
  else                                     stPower = "OK";

  // Temperature
  if (tempC < -100)                        stTemp = "FAULT";   // probe disconnected
  else if (tempC >= T_FAULT)               stTemp = "FAULT";
  else if (tempC >= T_WARN)                stTemp = "WARN";
  else                                     stTemp = "OK";

  // Water: ~4068 is normal baseline; only flag minor warning above 4100 or 4200
  if (waterRaw >= WATER_FAULT)             stWater = "WARN";   // minor issue only
  else if (waterRaw >= WATER_WARN)         stWater = "WARN";   // minor issue only
  else                                     stWater = "OK";

  // Tamper
  float dp = pitch - basePitch;
  float dr = roll - baseRoll;
  tiltDev = sqrt(dp * dp + dr * dr);

  if (accelMag > SHOCK_G) {
    shockFlag = true;
    shockTime = millis();
  }
  if (shockFlag && millis() - shockTime > 10000) shockFlag = false;

  if (tiltDev >= TILT_FAULT)               stTamper = "FAULT";
  else if (shockFlag)                      stTamper = "FAULT";
  else if (tiltDev >= TILT_WARN)           stTamper = "WARN";
  else                                     stTamper = "OK";

  // Overall
  if (stPower == "FAULT" || stTemp == "FAULT" || stWater == "FAULT" || stTamper == "FAULT")
    overall = "CRITICAL";
  else if (stPower == "WARN" || stTemp == "WARN" || stWater == "WARN" || stTamper == "WARN")
    overall = "WARNING";
  else
    overall = "HEALTHY";

  // Local alerts
  if (overall == "CRITICAL") {
    digitalWrite(PIN_LED, HIGH);
    digitalWrite(PIN_BUZZER, HIGH);
  } else if (overall == "WARNING") {
    digitalWrite(PIN_LED, (millis() / 500) % 2);
    digitalWrite(PIN_BUZZER, LOW);
  } else {
    digitalWrite(PIN_LED, LOW);
    digitalWrite(PIN_BUZZER, LOW);
  }
}

// ---------------- Web dashboard ----------------
const char PAGE_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CCTV Health Monitor</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;background:#10141a;color:#e8eaed;margin:0;padding:18px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#8b94a3;font-size:13px;margin-bottom:16px}
.banner{padding:14px;border-radius:8px;font-size:18px;font-weight:bold;text-align:center;margin-bottom:16px}
.HEALTHY{background:#17432a;color:#59d98b}
.WARNING{background:#4a3c12;color:#f0c419}
.CRITICAL{background:#4d1b1b;color:#ff6b6b}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
.card{background:#1a1f28;border-radius:8px;padding:14px;border-left:5px solid #555}
.card.OK{border-left-color:#59d98b}
.card.WARN{border-left-color:#f0c419}
.card.FAULT{border-left-color:#ff6b6b}
.title{font-size:13px;color:#8b94a3;text-transform:uppercase;letter-spacing:1px}
.val{font-size:26px;font-weight:bold;margin:6px 0}
.row{font-size:13px;color:#b7bec9;margin:2px 0}
.tag{float:right;font-size:11px;padding:2px 8px;border-radius:10px;background:#2a303c}
</style></head><body>
<h1>CCTV Health Monitoring System</h1>
<div class="sub">ESP32 &middot; INA219 &middot; MPU6050 &middot; DS18B20 &middot; Water Level</div>
<div id="banner" class="banner HEALTHY">--</div>
<div class="grid">
  <div class="card" id="c_pwr"><div class="title">Power Supply<span class="tag" id="s_pwr">--</span></div>
    <div class="val"><span id="v">--</span> V</div>
    <div class="row">Current: <span id="i">--</span> mA</div>
    <div class="row">Power: <span id="p">--</span> mW</div></div>

  <div class="card" id="c_tmp"><div class="title">Housing Temp<span class="tag" id="s_tmp">--</span></div>
    <div class="val"><span id="t">--</span> &deg;C</div>
    <div class="row">Warn above 60 &deg;C</div></div>

  <div class="card" id="c_wtr"><div class="title">Water Ingress<span class="tag" id="s_wtr">--</span></div>
    <div class="val"><span id="w">--</span></div>
    <div class="row">Normal ~4068 | Minor &gt; 4100</div></div>

  <div class="card" id="c_tmp2"><div class="title">Tamper / Tilt<span class="tag" id="s_tmr">--</span></div>
    <div class="val"><span id="d">--</span> &deg;</div>
    <div class="row">Pitch: <span id="pi">--</span>&deg; &nbsp; Roll: <span id="ro">--</span>&deg;</div>
    <div class="row">Impact: <span id="sh">--</span></div></div>

  <div class="card"><div class="title">Uptime</div>
    <div class="val"><span id="up">--</span></div>
    <div class="row">Since last reboot</div></div>
</div>
<script>
function g(id){return document.getElementById(id);}
function setCard(card,tag,st){g(card).className='card '+st;g(tag).innerText=st;}
async function tick(){
  try{
    const r=await fetch('/data');const d=await r.json();
    g('banner').className='banner '+d.overall;g('banner').innerText=d.overall;
    g('v').innerText=d.v.toFixed(2);g('i').innerText=d.i.toFixed(0);g('p').innerText=d.p.toFixed(0);
    g('t').innerText=d.t.toFixed(1);g('w').innerText=d.w;
    g('d').innerText=d.dev.toFixed(1);g('pi').innerText=d.pitch.toFixed(1);g('ro').innerText=d.roll.toFixed(1);
    g('sh').innerText=d.shock?'DETECTED':'none';
    let s=d.up,h=Math.floor(s/3600),m=Math.floor(s%3600/60);g('up').innerText=h+'h '+m+'m';
    setCard('c_pwr','s_pwr',d.stPower);setCard('c_tmp','s_tmp',d.stTemp);
    setCard('c_wtr','s_wtr',d.stWater);setCard('c_tmp2','s_tmr',d.stTamper);
  }catch(e){}
}
setInterval(tick,1500);tick();
</script></body></html>
)HTML";

void handleRoot() {
  server.send_P(200, "text/html", PAGE_HTML);
}

void handleData() {
  String j = "{";
  j += "\"v\":" + String(busVoltage, 3) + ",";
  j += "\"i\":" + String(current_mA, 2) + ",";
  j += "\"p\":" + String(power_mW, 2) + ",";
  j += "\"t\":" + String(tempC, 2) + ",";
  j += "\"w\":" + String(waterRaw) + ",";
  j += "\"pitch\":" + String(pitch, 2) + ",";
  j += "\"roll\":" + String(roll, 2) + ",";
  j += "\"dev\":" + String(tiltDev, 2) + ",";
  j += "\"shock\":" + String(shockFlag ? "true" : "false") + ",";
  j += "\"stPower\":\"" + stPower + "\",";
  j += "\"stTemp\":\"" + stTemp + "\",";
  j += "\"stWater\":\"" + stWater + "\",";
  j += "\"stTamper\":\"" + stTamper + "\",";
  j += "\"overall\":\"" + overall + "\",";
  j += "\"up\":" + String((millis() - bootTime) / 1000);
  j += "}";
  server.send(200, "application/json", j);
}

// ---------------- Live FastAPI Backend Telemetry ----------------
unsigned long lastTelemetry = 0;

void sendTelemetryToBackend() {
  // Construct JSON payload matching FastAPI TelemetryPayload
  String jsonPayload = "{";
  jsonPayload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  jsonPayload += "\"voltage\":" + String(busVoltage, 3) + ",";
  jsonPayload += "\"current_ma\":" + String(current_mA, 2) + ",";
  jsonPayload += "\"power_mw\":" + String(power_mW, 2) + ",";
  jsonPayload += "\"temperature\":" + String(tempC, 2) + ",";
  jsonPayload += "\"water_level\":" + String(waterRaw) + ",";
  jsonPayload += "\"tilt\":" + String(tiltDev, 2) + ",";
  jsonPayload += "\"pitch\":" + String(pitch, 2) + ",";
  jsonPayload += "\"roll\":" + String(roll, 2) + ",";
  jsonPayload += "\"vibration\":" + String(accelMag, 3) + ",";
  jsonPayload += "\"shock\":" + String(shockFlag ? "true" : "false") + ",";
  jsonPayload += "\"status_power\":\"" + stPower + "\",";
  jsonPayload += "\"status_temp\":\"" + stTemp + "\",";
  jsonPayload += "\"status_water\":\"" + stWater + "\",";
  jsonPayload += "\"status_tamper\":\"" + stTamper + "\",";
  jsonPayload += "\"overall\":\"" + overall + "\"";
  if (WiFi.status() == WL_CONNECTED) {
    jsonPayload += ",\"ip_address\":\"" + WiFi.localIP().toString() + "\"";
  } else {
    jsonPayload += ",\"ip_address\":null";
  }
  jsonPayload += "}";

  // 1. Output structured JSON to Serial (enables USB Serial Bridge when connected by USB cable)
  Serial.print("[TELEMETRY_JSON] ");
  Serial.println(jsonPayload);

  // 2. Transmit directly to FastAPI backend over Wi-Fi
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String endpoint = String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT) + TELEMETRY_PATH;
    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Api-Key", API_KEY);
    http.setTimeout(2500);

    int httpCode = http.POST(jsonPayload);
    if (httpCode > 0) {
      Serial.printf("[HTTP -> FastAPI] Data transmitted successfully (Status: %d)\n", httpCode);
    } else {
      Serial.printf("[HTTP -> FastAPI] Transmit error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  } else {
    // If Wi-Fi disconnected, attempt non-blocking reconnect periodically
    static unsigned long lastWifiAttempt = 0;
    if (millis() - lastWifiAttempt > 10000) {
      lastWifiAttempt = millis();
      Serial.println("[WiFi] Reconnecting...");
      WiFi.reconnect();
    }
  }
}

// ---------------- Setup / Loop ----------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_WATER_PWR, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);
  digitalWrite(PIN_WATER_PWR, LOW);

  Wire.begin(21, 22);

  if (!ina219.begin()) {
    Serial.println("INA219 not found");
  }
  ina219.setCalibration_16V_400mA();   // better resolution; use default for >400mA loads
  // For cameras drawing up to ~1A use: ina219.setCalibration_32V_1A();

  mpuInit();
  ds18b20.begin();

  Serial.println("Capturing tilt baseline - keep camera still...");
  captureBaseline();
  Serial.printf("Baseline pitch=%.2f roll=%.2f\n", basePitch, baseRoll);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Dashboard: http://");
    Serial.println(WiFi.localIP());
    Serial.printf("Transmitting health telemetry to: http://%s:%d%s\n", BACKEND_HOST, BACKEND_PORT, TELEMETRY_PATH);
  } else {
    Serial.println("WiFi failed - running offline (Serial bridge supported)");
  }

  server.on("/", handleRoot);
  server.on("/data", handleData);
  server.begin();

  bootTime = millis();
}

void loop() {
  server.handleClient();

  // Fast loop for impact detection
  mpuRead();
  if (accelMag > SHOCK_G) {
    shockFlag = true;
    shockTime = millis();
  }

  // 1. Sample sensors and evaluate health every 1 second
  if (millis() - lastRead >= 1000) {
    lastRead = millis();

    busVoltage = ina219.getBusVoltage_V();
    current_mA = ina219.getCurrent_mA();
    power_mW   = ina219.getPower_mW();

    ds18b20.requestTemperatures();
    tempC = ds18b20.getTempCByIndex(0);

    waterRaw = readWater();

    evaluateHealth();

    Serial.printf("V=%.2f I=%.0fmA T=%.1fC W=%d Tilt=%.1f -> %s\n",
                  busVoltage, current_mA, tempC, waterRaw, tiltDev, overall.c_str());
  }

  // 2. Transmit telemetry to FastAPI backend every TELEMETRY_INTERVAL_MS (30 seconds)
  if (millis() - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
    lastTelemetry = millis();
    sendTelemetryToBackend();
  }
}