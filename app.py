from flask import Flask, render_template, request, jsonify, Response
import sqlite3
import threading
import time
from datetime import datetime, timedelta
import csv
import io
import shutil
import os
import platform
from pymodbus.client import ModbusTcpClient
from pymodbus.payload import BinaryPayloadDecoder
from pymodbus.constants import Endian
import json
import threading
import pandas as pd

app = Flask(__name__)

# Detect operating system and set paths accordingly
def get_system_paths():
    system = platform.system().lower()
    
    if system == "linux":  # Raspberry Pi
        # Try to detect if we're on a Raspberry Pi specifically
        try:
            with open('/proc/cpuinfo', 'r') as f:
                cpuinfo = f.read()
            if 'raspberry pi' in cpuinfo.lower() or 'bcm' in cpuinfo.lower():
                # Raspberry Pi detected
                base_dir = "/home/ksbengdev/flask_app00"
                download_folder = "/home/ksbengdev/Downloads"
                usb_paths = [
                    "/media/ksbengdev/KSBISMS",
                    "/media/usb",
                    "/media/pi/USB", 
                    "/media/pi",
                    "/mnt/usb"
                ]
            else:
                # Generic Linux
                base_dir = os.path.dirname(os.path.abspath(__file__))
                download_folder = os.path.join(base_dir, "downloads")
                usb_paths = ["/media/usb", "/mnt/usb", "/media"]
        except:
            # Fallback for Linux
            base_dir = os.path.dirname(os.path.abspath(__file__))
            download_folder = os.path.join(base_dir, "downloads")
            usb_paths = ["/media/usb", "/mnt/usb"]
    else:  # Windows
        base_dir = os.path.dirname(os.path.abspath(__file__))
        download_folder = os.path.join(base_dir, "downloads")
        # Windows USB detection will be handled differently
        usb_paths = []
        
    return {
        "base_dir": base_dir,
        "database": os.path.join(base_dir, "data.db"),
        "state_file": os.path.join(base_dir, "system_state.txt"),
        "download_folder": download_folder,
        "usb_paths": usb_paths
    }

def find_usb_drive():
    """Find available USB drive across different platforms"""
    system = platform.system().lower()
    
    if system == "windows":
        # Windows: Check available drive letters
        import string
        available_drives = []
        for letter in string.ascii_uppercase:
            drive_path = f"{letter}:\\"
            if os.path.exists(drive_path):
                try:
                    # Test if we can write to this drive
                    test_file = os.path.join(drive_path, "test_write.tmp")
                    with open(test_file, 'w') as f:
                        f.write("test")
                    os.remove(test_file)
                    available_drives.append(drive_path)
                except:
                    continue
        return available_drives[0] if available_drives else None
    else:
        # Linux/Raspberry Pi: Check common USB mount points
        for path in USB_PATHS:
            if os.path.exists(path) and os.path.isdir(path):
                try:
                    # Test write access
                    test_file = os.path.join(path, "test_write.tmp")
                    with open(test_file, 'w') as f:
                        f.write("test")
                    os.remove(test_file)
                    return path
                except:
                    continue
        return None

# Get system-specific paths
PATHS = get_system_paths()
BASE_DIR = PATHS["base_dir"]
DATABASE = PATHS["database"]
STATE_FILE = PATHS["state_file"]
DOWNLOAD_FOLDER = PATHS["download_folder"]
USB_PATHS = PATHS["usb_paths"]

# Ensure directories exist
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)
os.makedirs(BASE_DIR, exist_ok=True)

# Create uploads directory for CSV files
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Configure Flask for file uploads
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Konfigurasi Modbus
MODBUS_IP = "10.23.104.92"
MODBUS_PORT = 502
MODBUS_REGISTER = 50  # Register 40051 (0-based index)
UNIT_ID = 1  # ID Slave perangkat Modbus

def save_interval_to_file(interval):
    try:
        with open("config.json", "w") as f:
            json.dump({"secTimeInterval": interval}, f)
        print(f"[CONFIG] Interval saved to file: {interval} seconds")
    except Exception as e:
        print(f"[SAVE ERROR] Failed to write interval to file: {e}")

def load_interval_from_file():
    try:
        with open("config.json", "r") as f:
            data = json.load(f)
            interval = int(data.get("secTimeInterval", 5))
            print(f"[CONFIG] Interval loaded from file: {interval} seconds")
            return interval
    except Exception as e:
        print(f"[LOAD WARNING] Using default interval (5s): {e}")
        return 5

def get_sensor_calibration(sensor_number):
    """Get calibration settings for a specific sensor"""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''SELECT sensor_name, enabled, min_value, max_value, unit 
                     FROM sensor_settings WHERE sensor_number = ?''', (sensor_number,))
        row = c.fetchone()
        conn.close()
        
        if row:
            return {
                'name': row[0] or f'Sensor {sensor_number}',
                'enabled': bool(row[1]),
                'min': float(row[2]) if row[2] is not None else 0.0,
                'max': float(row[3]) if row[3] is not None else 100.0,
                'unit': row[4] or ''
            }
        else:
            # Return default calibration
            return {
                'name': f'Sensor {sensor_number}',
                'enabled': True,
                'min': 0.0,
                'max': 100.0,
                'unit': ''
            }
    except Exception as e:
        print(f"Error getting sensor calibration for sensor {sensor_number}: {e}")
        return {
            'name': f'Sensor {sensor_number}',
            'enabled': True,
            'min': 0.0,
            'max': 100.0,
            'unit': ''
        }

def apply_sensor_calibration(raw_value, sensor_number):
    """Apply calibration to raw sensor value (0-100) to get calibrated value"""
    try:
        calibration = get_sensor_calibration(sensor_number)
        
        if not calibration['enabled']:
            return 0.0
            
        # Ensure raw_value is within 0-100 range
        raw_value = max(0, min(100, raw_value))
        
        # Map from 0-100 to min-max range
        calibrated_value = calibration['min'] + (raw_value / 100.0) * (calibration['max'] - calibration['min'])
        
        return round(calibrated_value, 4)
    except Exception as e:
        print(f"Error applying calibration for sensor {sensor_number}: {e}")
        return raw_value


# Variabel global untuk kontrol threading
interval_lock = threading.Lock()
secTimeInterval = load_interval_from_file()
running = True

# Global thread references for proper cleanup
basic_thread = None
advanced_thread = None
thread_stop_event = threading.Event()

@app.route("/set-interval", methods=["POST"])
def set_interval():
    global secTimeInterval, basic_thread, advanced_thread, thread_stop_event
    data = request.get_json()
    try:
        detik = int(data.get("interval"))
        if 1 <= detik <= 3600:
            with interval_lock:
                old_interval = secTimeInterval
                secTimeInterval = detik
                save_interval_to_file(detik)
                print(f"[SET] Interval updated from {old_interval}s to {detik}s")
                
                # If system is running, restart threads with new interval
                if running and (basic_thread or advanced_thread):
                    print("[SET] Restarting data collection threads with new interval...")
                    restart_data_collection_threads()
                    
            return jsonify({"status": "success", "secTimeInterval": secTimeInterval})
        else:
            return jsonify({"status": "invalid_range", "message": "Interval must be between 1-3600 seconds"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/get-interval", methods=["GET"])
def get_interval():
    with interval_lock:
        return jsonify({"secTimeInterval": secTimeInterval})

def restart_data_collection_threads():
    """Restart data collection threads with new interval"""
    global basic_thread, advanced_thread, thread_stop_event, running
    
    try:
        # Signal existing threads to stop
        thread_stop_event.set()
        
        # Wait for threads to finish (with timeout)
        if basic_thread and basic_thread.is_alive():
            basic_thread.join(timeout=2)
        if advanced_thread and advanced_thread.is_alive():
            advanced_thread.join(timeout=2)
            
        # Clear the stop event for new threads
        thread_stop_event.clear()
        
        # Start new threads if system is still running
        if running:
            basic_thread = threading.Thread(target=read_basic_sensor_data)
            basic_thread.daemon = True
            basic_thread.start()
            
            advanced_thread = threading.Thread(target=read_advanced_data)
            advanced_thread.daemon = True
            advanced_thread.start()
            
            print(f"[RESTART] Data collection threads restarted with {secTimeInterval}s interval")
        
    except Exception as e:
        print(f"[RESTART ERROR] Failed to restart threads: {e}")

# Load/Membuat tabel jika belum ada
def create_table():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    
    # Check if data table exists and has all columns
    c.execute("PRAGMA table_info(data)")
    columns = [column[1] for column in c.fetchall()]
    
    if 'data' not in [table[0] for table in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]:
        # Create new table with all 7 channels
        c.execute('''CREATE TABLE data (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        date TEXT,
                        time TEXT,
                        ch1 REAL,
                        ch2 REAL,
                        ch3 REAL,
                        ch4 REAL,
                        ch5 REAL,
                        ch6 REAL,
                        ch7 REAL
                    )''')
    else:
        # Add missing columns if they don't exist
        required_columns = ['ch4', 'ch5', 'ch6', 'ch7']
        for col in required_columns:
            if col not in columns:
                try:
                    c.execute(f"ALTER TABLE data ADD COLUMN {col} REAL DEFAULT 0.0")
                    print(f"Added column {col} to data table")
                except sqlite3.OperationalError as e:
                    print(f"Column {col} might already exist: {e}")

    # Tabel Powermeter
    c.execute('''CREATE TABLE IF NOT EXISTS powermeter_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pm_current INTEGER,
                    pm_voltage INTEGER,
                    pm_r INTEGER,
                    pm_q INTEGER,
                    pm_s INTEGER,
                    pm_ip TEXT
                )''')

    # Tabel Engine
    c.execute('''CREATE TABLE IF NOT EXISTS engine_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    e_speed INTEGER,
                    e_load INTEGER,
                    e_fuelrate INTEGER,
                    e_runhour INTEGER,
                    e_oilpressure INTEGER,
                    e_ip TEXT
                )''')

    # Check if full_data table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='full_data'")
    table_exists = c.fetchone() is not None
    
    if not table_exists:
        # Create full_data table
        c.execute('''CREATE TABLE full_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                time TEXT,
                e_speed REAL,
                e_load REAL,
                e_fuelrate REAL,
                e_runhour REAL,
                e_oilpressure REAL,
                pm_current REAL,
                pm_voltage REAL,
                pm_r REAL,
                pm_q REAL,
                pm_s REAL
            )''')

    # Create sensor_settings table if it doesn't exist
    c.execute('''CREATE TABLE IF NOT EXISTS sensor_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_number INTEGER,
                sensor_name TEXT,
                enabled INTEGER,
                min_value REAL DEFAULT 0.0,
                max_value REAL DEFAULT 100.0,
                unit TEXT DEFAULT ''
            )''')

    # Check if sensor_settings table has the new calibration columns
    c.execute("PRAGMA table_info(sensor_settings)")
    existing_columns = [column[1] for column in c.fetchall()]
    
    # Add calibration columns if they don't exist
    if 'min_value' not in existing_columns:
        c.execute("ALTER TABLE sensor_settings ADD COLUMN min_value REAL DEFAULT 0.0")
        print("Added min_value column to sensor_settings")
    
    if 'max_value' not in existing_columns:
        c.execute("ALTER TABLE sensor_settings ADD COLUMN max_value REAL DEFAULT 100.0")
        print("Added max_value column to sensor_settings")
    
    if 'unit' not in existing_columns:
        c.execute("ALTER TABLE sensor_settings ADD COLUMN unit TEXT DEFAULT ''")
        print("Added unit column to sensor_settings")

    # Check if sensor_settings table is empty and add default values if needed
    c.execute("SELECT COUNT(*) FROM sensor_settings")
    if c.fetchone()[0] == 0:
        # Add default sensor settings with calibration
        default_sensors = [
            (1, "Discharge Pressure", 1, 0.0, 100.0, "bar"),
            (2, "Suction Pressure", 1, 0.0, 50.0, "bar"),
            (3, "Vibration", 1, 0.0, 20.0, "mm/s"),
            (4, "Temperature", 1, 0.0, 150.0, "°C"),
            (5, "Flow Rate", 1, 0.0, 500.0, "L/min"),
            (6, "Power", 1, 0.0, 1000.0, "kW"),
            (7, "Efficiency", 1, 0.0, 100.0, "%")
        ]
        
        for sensor_data in default_sensors:
            c.execute('''INSERT INTO sensor_settings 
                        (sensor_number, sensor_name, enabled, min_value, max_value, unit) 
                        VALUES (?, ?, ?, ?, ?, ?)''', sensor_data)
        print("Added default sensor settings with calibration")

    conn.commit()
    conn.close()

# Panggil saat startup
create_table()

def get_system_state():
    """Check if the system should be running based on stored state"""
    if not os.path.exists(STATE_FILE):
        with open(STATE_FILE, "w") as f:
            f.write("running")
        return True

    with open(STATE_FILE, "r") as f:
        state = f.read().strip()
    
    return state == "running"

def set_system_state(running):
    """Store the current system state"""
    with open(STATE_FILE, "w") as f:
        f.write("running" if running else "stopped")

def get_latest_engine_settings():
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''SELECT e_ip, e_speed, e_load, e_fuelrate, e_runhour, e_oilpressure 
                    FROM engine_settings ORDER BY id DESC LIMIT 1''')
        row = c.fetchone()
        conn.close()
        
        if row:
            print(f"Engine settings found: IP={row[0]}, Speed={row[1]}, Load={row[2]}, Fuel={row[3]}, RunHour={row[4]}, Oil={row[5]}")
            return {
                "ip": row[0],
                "speed": int(row[1]),
                "load": int(row[2]),
                "fuelrate": int(row[3]),
                "runhour": int(row[4]),
                "oilpressure": int(row[5])
            }
        else:
            print("No engine settings found in database")
            return None
    except Exception as e:
        print(f"Error getting engine settings: {e}")
        return None

def get_latest_powermeter_settings():
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''SELECT pm_ip, pm_current, pm_voltage, pm_r, pm_q, pm_s 
                    FROM powermeter_settings ORDER BY id DESC LIMIT 1''')
        row = c.fetchone()
        conn.close()
        
        if row:
            print(f"Powermeter settings found: IP={row[0]}, Current={row[1]}, Voltage={row[2]}, R={row[3]}, Q={row[4]}, S={row[5]}")
            return {
                "ip": row[0],
                "current": int(row[1]),
                "voltage": int(row[2]),
                "r": int(row[3]),
                "q": int(row[4]),
                "s": int(row[5])
            }
        else:
            print("No powermeter settings found in database")
            return None
    except Exception as e:
        print(f"Error getting powermeter settings: {e}")
        return None

def get_current_interval():
    """Get the current interval setting"""
    with interval_lock:
        return secTimeInterval

def read_basic_sensor_data():
    global running, thread_stop_event
    print(f"[BASIC] Starting basic sensor data collection thread")
    
    while running and not thread_stop_event.is_set():
        try:
            # Get current interval setting
            current_interval = get_current_interval()
            
            now = datetime.now()
            date = now.strftime("%Y-%m-%d")
            clock = now.strftime("%H:%M:%S")
            
            # Initialize default values (raw 0-100 values)
            raw_values = [0.0] * 7
            connection_successful = False
            
            try:
                basic_client = ModbusTcpClient(MODBUS_IP, port=MODBUS_PORT)
                if basic_client.connect():
                    # Read all 7 channels
                    responses = []
                    for i in range(7):
                        register_address = 50 + (i * 2)  # 50, 52, 54, 56, 58, 60, 62
                        response = basic_client.read_holding_registers(address=register_address, count=2, slave=UNIT_ID)
                        responses.append(response)
                    
                    # Check if all responses are valid
                    if all(not resp.isError() for resp in responses):
                        connection_successful = True
                        for i, response in enumerate(responses):
                            try:
                                decoder = BinaryPayloadDecoder.fromRegisters(response.registers, byteorder=Endian.BIG, wordorder=Endian.BIG)
                                value = round(decoder.decode_32bit_float(), 4)
                                raw_values[i] = value
                            except Exception as e:
                                print(f"Error decoding CH{i+1}: {e}")
                                raw_values[i] = 0.0  # Keep default value on decode error
                    
                    basic_client.close()
                    
                if connection_successful:
                    print(f"✓ Basic raw data collected (interval: {current_interval}s): {date} {clock}")
                    for i, raw_val in enumerate(raw_values):
                        print(f"  CH{i+1} raw: {raw_val}")
                else:
                    print(f"⚠ Basic Modbus connection failed, using default values (interval: {current_interval}s): {date} {clock}")
                    
            except Exception as e:
                print(f"✗ Error reading basic Modbus data: {e}")
                print(f"⚠ Using default values (interval: {current_interval}s): {date} {clock}")
            
            # Apply calibration to raw values before storing
            calibrated_values = []
            for i, raw_value in enumerate(raw_values):
                calibrated_value = apply_sensor_calibration(raw_value, i + 1)
                calibrated_values.append(calibrated_value)
                
                # Log calibration info
                calibration = get_sensor_calibration(i + 1)
                if calibration['enabled']:
                    print(f"  CH{i+1}: {raw_value} (raw) -> {calibrated_value} {calibration['unit']} (calibrated)")
            
            # Store calibrated data in database
            ch1, ch2, ch3, ch4, ch5, ch6, ch7 = calibrated_values
            with sqlite3.connect(DATABASE) as conn:
                c = conn.cursor()
                c.execute("INSERT INTO data (date, time, ch1, ch2, ch3, ch4, ch5, ch6, ch7) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (date, clock, ch1, ch2, ch3, ch4, ch5, ch6, ch7))
                conn.commit()
            
        except Exception as e:
            print("Global error in read_basic_sensor_data:", e)
            # Even on global error, log default data to maintain continuity
            current_interval = get_current_interval()
            now = datetime.now()
            date = now.strftime("%Y-%m-%d")
            clock = now.strftime("%H:%M:%S")
            
            # Apply calibration to default values (0.0)
            calibrated_values = []
            for i in range(7):
                calibrated_value = apply_sensor_calibration(0.0, i + 1)
                calibrated_values.append(calibrated_value)
            
            ch1, ch2, ch3, ch4, ch5, ch6, ch7 = calibrated_values
            try:
                with sqlite3.connect(DATABASE) as conn:
                    c = conn.cursor()
                    c.execute("INSERT INTO data (date, time, ch1, ch2, ch3, ch4, ch5, ch6, ch7) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (date, clock, ch1, ch2, ch3, ch4, ch5, ch6, ch7))
                    conn.commit()
                print(f"✓ Default calibrated data logged due to global error (interval: {current_interval}s): {date} {clock}")
            except Exception as db_error:
                print(f"✗ Database error: {db_error}")
        
        # Use current interval setting for sleep with interruption check
        current_interval = get_current_interval()
        print(f"[BASIC] Sleeping for {current_interval} seconds...")
        
        # Sleep in small chunks to allow for quick thread termination
        sleep_chunks = max(1, current_interval)  # At least 1 second chunks
        chunk_size = min(1, current_interval)  # 1 second or less per chunk
        
        for _ in range(int(current_interval / chunk_size)):
            if thread_stop_event.is_set() or not running:
                print("[BASIC] Thread stopping due to stop event")
                return
            time.sleep(1)
    
    print("[BASIC] Basic sensor data collection thread stopped")

def decode_float(response):
    try:
        decoder = BinaryPayloadDecoder.fromRegisters(
            response.registers, byteorder=Endian.BIG, wordorder=Endian.BIG
        )
        return round(decoder.decode_32bit_float(), 4)
    except Exception as e:
        print(" — Error decoding float:", e)
        return None

# === ADVANCED MODBUS LOGIC ===
def read_advanced_data():
    global running, thread_stop_event
    print(f"[ADVANCED] Starting advanced data collection thread")
    
    while running and not thread_stop_event.is_set():
        try:
            # Get current interval setting
            current_interval = get_current_interval()
            
            now = datetime.now()
            date = now.strftime("%Y-%m-%d")
            clock = now.strftime("%H:%M:%S")

            # Initialize default data dictionaries
            engine_data = {
                "speed": 0.0,
                "load": 0.0,
                "fuelrate": 0.0,
                "runhour": 0.0,
                "oilpressure": 0.0
            }
            powermeter_data = {
                "current": 0.0,
                "voltage": 0.0,
                "r": 0.0,
                "q": 0.0,
                "s": 0.0
            }
            
            engine_connected = False
            powermeter_connected = False
            
            try:
                # Get settings
                engine = get_latest_engine_settings()
                power = get_latest_powermeter_settings()
                
                # ENGINE
                if engine:
                    try:
                        print(f"Connecting to ENGINE at {engine['ip']}...")
                        client = ModbusTcpClient(engine["ip"], port=502)
                        if client.connect():
                            print(f"Connected to ENGINE. Reading registers...")
                            engine_connected = True
                            
                            # Read each register and handle errors individually
                            registers = ["speed", "load", "fuelrate", "runhour", "oilpressure"]
                            for i, reg_name in enumerate(registers):
                                try:
                                    response = client.read_holding_registers(address=engine.get(reg_name) - 40001, count=2, slave=1)
                                    if not response.isError():
                                        engine_data[reg_name] = decode_float(response)
                                        print(f"  {reg_name}: {engine_data[reg_name]}")
                                    else:
                                        print(f"  Error reading {reg_name} register {engine.get(reg_name)}")
                                        engine_data[reg_name] = 0.0
                                except Exception as e:
                                    print(f"  Exception reading {reg_name}: {e}")
                                    engine_data[reg_name] = 0.0
                        else:
                            print(f"⚠ Failed to connect to ENGINE {engine['ip']}, using default values")
                        client.close()
                    except Exception as e:
                        print(f"⚠ Engine read error: {e}, using default values")
                else:
                    print("⚠ No engine settings available, using default values")
                
                # POWERMETER
                if power:
                    try:
                        print(f"Connecting to POWERMETER at {power['ip']}...")
                        client = ModbusTcpClient(power["ip"], port=502)
                        if client.connect():
                            print(f"Connected to POWERMETER. Reading registers...")
                            powermeter_connected = True
                            
                            # Read each register and handle errors individually
                            registers = ["current", "voltage", "r", "q", "s"]
                            for i, reg_name in enumerate(registers):
                                try:
                                    response = client.read_holding_registers(address=power.get(reg_name) - 40001, count=2, slave=1)
                                    if not response.isError():
                                        powermeter_data[reg_name] = decode_float(response)
                                        print(f"  {reg_name}: {powermeter_data[reg_name]}")
                                    else:
                                        print(f"  Error reading {reg_name} register {power.get(reg_name)}")
                                        powermeter_data[reg_name] = 0.0
                                except Exception as e:
                                    print(f"  Exception reading {reg_name}: {e}")
                                    powermeter_data[reg_name] = 0.0
                        else:
                            print(f"⚠ Failed to connect to POWERMETER {power['ip']}, using default values")
                        client.close()
                    except Exception as e:
                        print(f"⚠ Powermeter read error: {e}, using default values")
                else:
                    print("⚠ No powermeter settings available, using default values")

                # Always save to full_data (either real or default values)
                try:
                    with sqlite3.connect(DATABASE) as conn:
                        c = conn.cursor()
                        c.execute('''INSERT INTO full_data (
                            date, time,
                            e_speed, e_load, e_fuelrate, e_runhour, e_oilpressure,
                            pm_current, pm_voltage, pm_r, pm_q, pm_s
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
                            date, clock,
                            engine_data.get("speed"),
                            engine_data.get("load"),
                            engine_data.get("fuelrate"),
                            engine_data.get("runhour"),
                            engine_data.get("oilpressure"),
                            powermeter_data.get("current"),
                            powermeter_data.get("voltage"),
                            powermeter_data.get("r"),
                            powermeter_data.get("q"),
                            powermeter_data.get("s")
                        ))
                        conn.commit()
                    
                    if engine_connected or powermeter_connected:
                        print(f"✓ Advanced data saved (interval: {current_interval}s): {date} {clock}")
                    else:
                        print(f"⚠ Default advanced data saved (interval: {current_interval}s): {date} {clock}")
                        
                except Exception as e:
                    print(f"✗ Error saving to full_data: {e}")
                    
            except Exception as e:
                print(f"⚠ Critical advanced Modbus read failure: {e}")
                
        except Exception as e:
            print(f"⚠ Global error in read_advanced_data: {e}")

        # Use current interval setting for sleep with interruption check
        current_interval = get_current_interval()
        print(f"[ADVANCED] Sleeping for {current_interval} seconds...")
        
        # Sleep in small chunks to allow for quick thread termination
        sleep_chunks = max(1, current_interval)  # At least 1 second chunks
        chunk_size = min(1, current_interval)  # 1 second or less per chunk
        
        for _ in range(int(current_interval / chunk_size)):
            if thread_stop_event.is_set() or not running:
                print("[ADVANCED] Thread stopping due to stop event")
                return
            time.sleep(1)
    
    print("[ADVANCED] Advanced data collection thread stopped")


# Endpoint untuk memulai pencatatan data (single button)
@app.route('/start', methods=['POST'])
def start_logging():
    global running, basic_thread, advanced_thread, thread_stop_event
    if not running:
        running = True
        set_system_state(True)
        
        # Clear any existing stop event
        thread_stop_event.clear()
        
        print(f"[START] Starting data collection with interval: {get_current_interval()} seconds")
        
        # Start basic sensor data thread
        basic_thread = threading.Thread(target=read_basic_sensor_data)
        basic_thread.daemon = True
        basic_thread.start()
        
        # Start advanced data thread
        advanced_thread = threading.Thread(target=read_advanced_data)
        advanced_thread.daemon = True
        advanced_thread.start()
        
    return jsonify({"status": "started", "message": "Data collection started for all sensors"})

# Endpoint untuk menghentikan pencatatan data
@app.route('/stop', methods=['POST'])
def stop_logging():
    global running, basic_thread, advanced_thread, thread_stop_event
    running = False
    set_system_state(False)
    
    # Signal threads to stop
    thread_stop_event.set()
    
    # Wait for threads to finish gracefully
    if basic_thread and basic_thread.is_alive():
        basic_thread.join(timeout=3)
    if advanced_thread and advanced_thread.is_alive():
        advanced_thread.join(timeout=3)
    
    print("[STOP] Data collection stopped")
    return jsonify({"status": "stopped", "message": "Data collection stopped for all sensors"})

# Endpoint untuk mendapatkan data terbaru
@app.route('/api/data')
def get_data():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    c.execute("SELECT id, date, time, ch1, ch2, ch3, ch4, ch5, ch6, ch7 FROM data ORDER BY id DESC LIMIT 10")
    rows = c.fetchall()
    conn.close()

    data = []
    for r in rows:
        # Handle cases where some channels might be None
        row_data = {
            "id": r[0], 
            "date": r[1], 
            "time": r[2], 
            "ch1": round(r[3] if r[3] is not None else 0.0, 4), 
            "ch2": round(r[4] if r[4] is not None else 0.0, 4), 
            "ch3": round(r[5] if r[5] is not None else 0.0, 4),
            "ch4": round(r[6] if r[6] is not None else 0.0, 4) if len(r) > 6 else 0.0,
            "ch5": round(r[7] if r[7] is not None else 0.0, 4) if len(r) > 7 else 0.0,
            "ch6": round(r[8] if r[8] is not None else 0.0, 4) if len(r) > 8 else 0.0,
            "ch7": round(r[9] if r[9] is not None else 0.0, 4) if len(r) > 9 else 0.0
        }
        data.append(row_data)

    return jsonify(data)


@app.route('/api/all-data')
def get_all_data():
    """
    API final yang andal: melakukan filter waktu dan sampling menggunakan fungsi internal SQLite.
    """
    time_range_str = request.args.get('range')
    interval_seconds = max(1, int(request.args.get('interval', 1)))

    time_delta_map = {
        '1h': 3600, '6h': 21600, '24h': 86400,
        '7d': 604800, '30d': 2592000
    }
    time_delta_seconds = time_delta_map.get(time_range_str)

    # Bangun Query yang paling kuat
    # WHERE clause akan dinonaktifkan jika time_delta_seconds adalah None (untuk 'all')
    query = """
        WITH NumberedRows AS (
            SELECT
                *,
                ROW_NUMBER() OVER(
                    PARTITION BY CAST(strftime('%s', date || ' ' || time) / ? AS INT)
                    ORDER BY id DESC
                ) as rn
            FROM data
            WHERE
                -- Klausa ini aktif hanya jika time_delta_seconds bukan None
                ? IS NULL OR datetime(date || ' ' || time) >= datetime('now', '-' || ? || ' seconds', 'localtime')
        )
        SELECT * FROM NumberedRows WHERE rn = 1 ORDER BY id DESC;
    """
    
    params = [
        interval_seconds,
        time_delta_seconds, 
        time_delta_seconds  
    ]

    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()

    data = [dict(row) for row in rows]
    print(f"API FINAL: Mengirim {len(data)} baris data untuk range '{time_range_str}'")
    return jsonify(data)

def generate_csv(data):
    # Ambil label nama sensor dari database dengan unit
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    c.execute("SELECT sensor_number, sensor_name, unit FROM sensor_settings")
    sensor_info = {}
    for row in c.fetchall():
        sensor_number, sensor_name, unit = row
        header = sensor_name or f"CH{sensor_number}"
        if unit:
            header += f" ({unit})"
        sensor_info[f"ch{sensor_number}"] = header
    conn.close()

    # Siapkan header
    headers = ['ID', 'Date', 'Time']
    for i in range(1, 8):  # ch1-ch7
        key = f"ch{i}"
        name = sensor_info.get(key, key.upper())
        headers.append(name)

    # Tulis CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)

    # Tulis data baris demi baris
    for row in data:
        writer.writerow([
            row.get('id', ''),
            row.get('date', ''),
            row.get('time', ''),
            row.get('ch1', ''),
            row.get('ch2', ''),
            row.get('ch3', ''),
            row.get('ch4', ''),
            row.get('ch5', ''),
            row.get('ch6', ''),
            row.get('ch7', '')
        ])

    output.seek(0)
    return output.getvalue()


# Endpoint untuk mengunduh data dalam format CSV
@app.route('/download/local')
def download():
    try:
        # Ambil label sensor dari database dengan unit
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute("SELECT sensor_number, sensor_name, unit FROM sensor_settings")
        sensor_info = {}
        for row in c.fetchall():
            sensor_number, sensor_name, unit = row
            header = sensor_name or f"CH{sensor_number}"
            if unit:
                header += f" ({unit})"
            sensor_info[f"ch{sensor_number}"] = header

        # Ambil data
        c.execute("SELECT id, date, time, ch1, ch2, ch3, ch4, ch5, ch6, ch7 FROM data ORDER BY id ASC")
        rows = c.fetchall()
        conn.close()

        if not rows:
            return jsonify({"status": "error", "message": "No data available to download"}), 404

        # Siapkan header
        headers = ['ID', 'Date', 'Time']
        for i in range(1, 8):
            key = f"ch{i}"
            label = sensor_info.get(key, key.upper())
            headers.append(label)

        # Buat CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)

        # Nama file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"KSB_ISMS_{timestamp}.csv"

        print(f"✓ Local download started: {filename} ({len(rows)} records)")

        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )

    except Exception as e:
        print(f"✗ Error downloading data: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/download/usb')
def download_usb():
    try:
        print("🔄 Starting USB download process...")
        
        # Ambil nama sensor dari DB dengan unit
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute("SELECT sensor_number, sensor_name, unit FROM sensor_settings")
        sensor_info = {}
        for row in c.fetchall():
            sensor_number, sensor_name, unit = row
            header = sensor_name or f"CH{sensor_number}"
            if unit:
                header += f" ({unit})"
            sensor_info[f"ch{sensor_number}"] = header

        # Ambil data
        c.execute("SELECT id, date, time, ch1, ch2, ch3, ch4, ch5, ch6, ch7 FROM data ORDER BY id ASC")
        rows = c.fetchall()
        conn.close()

        if not rows:
            print("✗ No data available for USB download")
            return jsonify({"status": "error", "message": "No data available to download"}), 404

        print(f"📊 Found {len(rows)} records to export")

        # Generate nama file & path
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"KSB_ISMS_{timestamp}.csv"
        local_path = os.path.join(DOWNLOAD_FOLDER, filename)
        
        print("🔍 Searching for USB drive...")
        
        # Find USB drive using cross-platform detection
        usb_drive = find_usb_drive()
        if not usb_drive:
            print("✗ USB drive not found")
            return jsonify({"status": "error", "message": "USB drive not found. Please insert a USB drive and ensure it's writable."}), 404

        print(f"✓ USB drive found: {usb_drive}")
        usb_path = os.path.join(usb_drive, filename)

        # Header CSV
        headers = ['ID', 'Date', 'Time']
        for i in range(1, 8):
            key = f"ch{i}"
            label = sensor_info.get(key, key.upper())
            headers.append(label)

        print("💾 Creating CSV file...")
        
        # Simpan CSV lokal
        with open(local_path, mode='w', newline='') as file:
            writer = csv.writer(file)
            writer.writerow(headers)
            writer.writerows(rows)

        print(f"✓ CSV file created: {local_path}")

        # Salin ke USB
        print("📁 Copying file to USB drive...")
        try:
            shutil.copy2(local_path, usb_path)
            print(f"✓ File successfully copied to USB: {usb_path}")
        except Exception as e:
            print(f"✗ Error copying to USB: {e}")
            # Clean up local file on error
            try:
                os.remove(local_path)
            except:
                pass
            return jsonify({"status": "error", "message": f"Error copying to USB: {str(e)}"}), 500

        # Hapus file lokal
        print("🧹 Cleaning up temporary file...")
        try:
            os.remove(local_path)
            print(f"✓ Temporary file deleted: {local_path}")
        except Exception as e:
            print(f"⚠️ Warning: Could not delete temporary file: {e}")

        print(f"🎉 USB download completed successfully: {filename}")
        return jsonify({
            "status": "success", 
            "message": f"Data successfully copied to USB as {filename}",
            "filename": filename,
            "records": len(rows),
            "usb_path": usb_drive
        })

    except Exception as e:
        print(f"✗ Critical error during USB download: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# === SAVE SENSOR SETTINGS ===
@app.route('/save-sensors', methods=['POST'])
def save_sensors():
    try:
        # Get form data instead of JSON for settings page
        form_data = request.form
        
        # Connect to database
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        # Update sensor settings with calibration data
        for i in range(1, 8):
            sensor_number = i
            enabled = form_data.get(f'sensor{i}_enabled') == 'on'
            name = form_data.get(f'sensor{i}_name', f'Sensor {i}')
            min_val = float(form_data.get(f'sensor{i}_min', 0.0))
            max_val = float(form_data.get(f'sensor{i}_max', 100.0))
            unit = form_data.get(f'sensor{i}_unit', '')
            
            # Check if sensor exists
            c.execute("SELECT id FROM sensor_settings WHERE sensor_number = ?", (sensor_number,))
            exists = c.fetchone()
            
            if exists:
                # Update existing sensor
                c.execute('''UPDATE sensor_settings 
                            SET sensor_name = ?, enabled = ?, min_value = ?, max_value = ?, unit = ?
                            WHERE sensor_number = ?''',
                            (name, 1 if enabled else 0, min_val, max_val, unit, sensor_number))
            else:
                # Insert new sensor
                c.execute('''INSERT INTO sensor_settings 
                            (sensor_number, sensor_name, enabled, min_value, max_value, unit) 
                            VALUES (?, ?, ?, ?, ?, ?)''',
                            (sensor_number, name, 1 if enabled else 0, min_val, max_val, unit))
        
        conn.commit()
        conn.close()
        
        print("Sensor settings with calibration saved successfully")
        return jsonify({"status": "success", "message": "Sensor settings saved successfully"})
    except Exception as e:
        print(f"Error saving sensor settings: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    


# Add this route to load sensor settings
@app.route('/load-sensors')
def load_sensors():
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''SELECT sensor_number, sensor_name, enabled, min_value, max_value, unit 
                     FROM sensor_settings ORDER BY sensor_number''')
        rows = c.fetchall()
        conn.close()
        
        sensor_data = {}
        for row in rows:
            sensor_number, sensor_name, enabled, min_value, max_value, unit = row
            sensor_data[f"sensor{sensor_number}"] = {
                "name": sensor_name,
                "enabled": enabled == 1,
                "min": float(min_value) if min_value is not None else 0.0,
                "max": float(max_value) if max_value is not None else 100.0,
                "unit": unit or ""
            }
        
        return jsonify(sensor_data)
    except Exception as e:
        print(f"Error loading sensor settings: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# Add a new endpoint to check the system state
@app.route('/api/system-state', methods=['GET'])
def get_api_system_state():
    return jsonify({"running": get_system_state()})

@app.route('/api/sensor-calibration/<int:sensor_number>')
def get_sensor_calibration_api(sensor_number):
    """API endpoint to get sensor calibration info"""
    try:
        calibration = get_sensor_calibration(sensor_number)
        return jsonify(calibration)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/all-sensor-calibrations')
def get_all_sensor_calibrations():
    """API endpoint to get all sensor calibration info"""
    try:
        calibrations = {}
        for i in range(1, 8):
            calibrations[f'ch{i}'] = get_sensor_calibration(i)
        return jsonify(calibrations)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


#Data Engine
@app.route('/save-engine', methods=['POST'])
def save_engine():
    try:
        # Get form data
        e_speed = request.form.get("e_speed", 0)
        e_load = request.form.get("e_load", 0)
        e_fuelrate = request.form.get("e_fuelrate", 0)
        e_runhour = request.form.get("e_runhour", 0)
        e_oilpressure = request.form.get("e_oilpressure", 0)
        e_ip = request.form.get("e_ip", "")
        
        # Print debug info
        print(f"Saving engine settings: IP={e_ip}, Speed={e_speed}, Load={e_load}, Fuel={e_fuelrate}, RunHour={e_runhour}, Oil={e_oilpressure}")
        
        # Validate data
        if not e_ip:
            return jsonify({"status": "error", "message": "IP address is required"}), 400
            
        # Convert registers to integers
        try:
            e_speed = int(e_speed)
            e_load = int(e_load)
            e_fuelrate = int(e_fuelrate)
            e_runhour = int(e_runhour)
            e_oilpressure = int(e_oilpressure)
        except ValueError:
            return jsonify({"status": "error", "message": "Registers must be numbers"}), 400
        
        # Save to database
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''INSERT INTO engine_settings 
                     (e_speed, e_load, e_fuelrate, e_runhour, e_oilpressure, e_ip) 
                     VALUES (?, ?, ?, ?, ?, ?)''', 
                     (e_speed, e_load, e_fuelrate, e_runhour, e_oilpressure, e_ip))
        conn.commit()
        conn.close()
        
        print("Engine settings saved successfully")
        return jsonify({"status": "success", "message": "Engine settings saved successfully"})
    except Exception as e:
        print(f"Error saving engine settings: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/load-engine')
def load_engine():
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''SELECT e_speed, e_load, e_fuelrate, e_runhour, e_oilpressure, e_ip 
                     FROM engine_settings ORDER BY id DESC LIMIT 1''')
        row = c.fetchone()
        conn.close()
        if row:
            return jsonify({
                "e_speed": row[0],
                "e_load": row[1],
                "e_fuelrate": row[2],
                "e_runhour": row[3],
                "e_oilpressure": row[4],
                "e_ip": row[5]
            })
        return jsonify({})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

#Data Powermeter
@app.route('/save-powermeter', methods=['POST'])
def save_powermeter():
    try:
        # Get form data
        pm_current = request.form.get("pm_current", 0)
        pm_voltage = request.form.get("pm_voltage", 0)
        pm_r = request.form.get("pm_r", 0)
        pm_q = request.form.get("pm_q", 0)
        pm_s = request.form.get("pm_s", 0)
        pm_ip = request.form.get("pm_ip", "")
        
        # Print debug info
        print(f"Saving powermeter settings: IP={pm_ip}, Current={pm_current}, Voltage={pm_voltage}, R={pm_r}, Q={pm_q}, S={pm_s}")
        
        # Validate data
        if not pm_ip:
            return jsonify({"status": "error", "message": "IP address is required"}), 400
            
        # Convert registers to integers
        try:
            pm_current = int(pm_current)
            pm_voltage = int(pm_voltage)
            pm_r = int(pm_r)
            pm_q = int(pm_q)
            pm_s = int(pm_s)
        except ValueError:
            return jsonify({"status": "error", "message": "Registers must be numbers"}), 400
        
        # Save to database
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''INSERT INTO powermeter_settings 
                     (pm_current, pm_voltage, pm_r, pm_q, pm_s, pm_ip) 
                     VALUES (?, ?, ?, ?, ?, ?)''', 
                     (pm_current, pm_voltage, pm_r, pm_q, pm_s, pm_ip))
        conn.commit()
        conn.close()
        
        print("Powermeter settings saved successfully")
        return jsonify({"status": "success", "message": "Powermeter settings saved successfully"})
    except Exception as e:
        print(f"Error saving powermeter settings: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/load-powermeter')
def load_powermeter():
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''SELECT pm_current, pm_voltage, pm_r, pm_q, pm_s, pm_ip 
                     FROM powermeter_settings ORDER BY id DESC LIMIT 1''')
        row = c.fetchone()
        conn.close()
        if row:
            return jsonify({
                "pm_current": row[0],
                "pm_voltage": row[1],
                "pm_r": row[2],
                "pm_q": row[3],
                "pm_s": row[4],
                "pm_ip": row[5]
            })
        return jsonify({})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# === READ MODBUS DATA ===
def read_device_data(ip, registers, unit=1):
    try:
        client = ModbusTcpClient(ip, port=502)
        if not client.connect():
            print(f"⚠ Failed to connect to {ip}, returning default values")
            return [0.0] * len(registers)  # Return default values instead of None

        result = []
        for reg in registers:
            try:
                resp = client.read_holding_registers(address=reg - 40001, count=2, slave=unit)
                if resp.isError():
                    print(f"⚠ Error reading register {reg}, using default value")
                    result.append(0.0)
                else:
                    try:
                        decoder = BinaryPayloadDecoder.fromRegisters(
                            resp.registers, byteorder=Endian.BIG, wordorder=Endian.BIG
                        )
                        value = decoder.decode_32bit_float()
                        result.append(round(value, 4))
                    except Exception as err:
                        print(f"⚠ Decode error at reg {reg}: {err}, using default value")
                        result.append(0.0)
            except Exception as e:
                print(f"⚠ Exception reading register {reg}: {e}, using default value")
                result.append(0.0)

        client.close()
        return result
    except Exception as e:
        print(f"⚠ Modbus read error from {ip}: {e}, returning default values")
        return [0.0] * len(registers)  # Return default values instead of None

@app.route('/api/powermeter-data')
def api_powermeter_data():
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute("SELECT pm_current, pm_voltage, pm_r, pm_q, pm_s, pm_ip FROM powermeter_settings ORDER BY id DESC LIMIT 1")
            row = c.fetchone()

        if not row:
            print("[PM] No powermeter settings found, returning default values")
            # Return default structure when no settings
            return jsonify([
                {"id": 1, "register": 0, "value": 0.0},
                {"id": 2, "register": 0, "value": 0.0},
                {"id": 3, "register": 0, "value": 0.0},
                {"id": 4, "register": 0, "value": 0.0},
                {"id": 5, "register": 0, "value": 0.0}
            ])

        registers = [int(row[0]), int(row[1]), int(row[2]), int(row[3]), int(row[4])]
        ip = row[5]
        
        # Always return a data structure, even if connection fails
        data = []
        values = read_device_data(ip, registers)
        
        print(f"\n✓ Powermeter data request from {ip} port 502:")
        for i, reg in enumerate(registers):
            val = values[i] if values and i < len(values) and values[i] is not None else 0.0
            data.append({"id": i+1, "register": reg, "value": val})
            print(f"  {reg} : {val}")

        return jsonify(data)

    except Exception as e:
        print(f"[PM ERROR] {e}")
        # Return default structure on error
        return jsonify([
            {"id": 1, "register": 0, "value": 0.0},
            {"id": 2, "register": 0, "value": 0.0},
            {"id": 3, "register": 0, "value": 0.0},
            {"id": 4, "register": 0, "value": 0.0},
            {"id": 5, "register": 0, "value": 0.0}
        ])

@app.route('/api/engine-data')
def api_engine_data():
    try:
        with sqlite3.connect(DATABASE) as conn:
            c = conn.cursor()
            c.execute("SELECT e_speed, e_load, e_fuelrate, e_runhour, e_oilpressure, e_ip FROM engine_settings ORDER BY id DESC LIMIT 1")
            row = c.fetchone()

        if not row:
            print("[ENGINE] No engine settings found, returning default values")
            # Return default structure when no settings
            return jsonify([
                {"id": 1, "register": 0, "value": 0.0},
                {"id": 2, "register": 0, "value": 0.0},
                {"id": 3, "register": 0, "value": 0.0},
                {"id": 4, "register": 0, "value": 0.0},
                {"id": 5, "register": 0, "value": 0.0}
            ])

        registers = [int(row[0]), int(row[1]), int(row[2]), int(row[3]), int(row[4])]
        ip = row[5]
        
        print(f"Reading engine data from {ip} with registers {registers}")
        
        # Always return a data structure, even if connection fails
        data = []
        values = read_device_data(ip, registers)

        print(f"\n✓ Engine data request from {ip} port 502:")
        for i, reg in enumerate(registers):
            val = values[i] if values and i < len(values) and values[i] is not None else 0.0
            data.append({"id": i+1, "register": reg, "value": val}) 
            print(f"  {reg} : {val}")

        return jsonify(data)

    except Exception as e:
        print(f"[ENGINE ERROR] {e}")
        # Return default structure on error
        return jsonify([
            {"id": 1, "register": 0, "value": 0.0},
            {"id": 2, "register": 0, "value": 0.0},
            {"id": 3, "register": 0, "value": 0.0},
            {"id": 4, "register": 0, "value": 0.0},
            {"id": 5, "register": 0, "value": 0.0}
        ])

@app.route('/clear-log', methods=['POST'])
def clear_log():
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        # Delete all data from the table
        c.execute("DELETE FROM data")
        
        # Reset the auto-increment counter
        c.execute("DELETE FROM sqlite_sequence WHERE name='data'")
        
        # Commit changes before VACUUM
        conn.commit()
        
        # Rebuild the database file to reclaim space and fully reset
        c.execute("VACUUM")
        
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Log data cleared, ID reset, and database optimized."})
    except Exception as e:
        print(f"Error clearing log: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/latest-full-data")
def latest_full_data():
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('''SELECT * FROM full_data ORDER BY id DESC LIMIT 1''')
        row = c.fetchone()

    if not row:
        return jsonify({"error": "No data yet"}), 404

    keys = ["id", "date", "time",
            "e_speed", "e_load", "e_fuelrate", "e_runhour", "e_oilpressure",
            "pm_current", "pm_voltage", "pm_r", "pm_q", "pm_s"]

    return jsonify([dict(zip(keys, row))])

# NEW DATA VISUALIZATION ROUTES
@app.route('/dataviz')
def dataviz():
    """Data visualization page for uploaded CSV files"""
    return render_template('dataviz.html')

@app.route('/upload-csv', methods=['POST'])
def upload_csv():
    try:
        print(f"[UPLOAD] Received upload request")
        
        if 'csvFile' not in request.files:
            return jsonify({"status": "error", "message": "No file uploaded"}), 400
        
        file = request.files['csvFile']
        if file.filename == '':
            return jsonify({"status": "error", "message": "No file selected"}), 400
        
        if not file.filename.lower().endswith('.csv'):
            return jsonify({"status": "error", "message": "Please upload a CSV file"}), 400
        
        filename = f"uploaded_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        encodings = ['utf-8', 'latin-1', 'cp1252']
        df = None
        
        for encoding in encodings:
            try:
                df = pd.read_csv(filepath, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        
        if df is None:
            return jsonify({"status": "error", "message": "Could not read CSV file. Please check file encoding."}), 400
        
        expected_columns = ['ID', 'Date', 'Time']
        missing_basic = [col for col in expected_columns if col not in df.columns]
        
        if missing_basic:
            return jsonify({"status": "error", "message": f"CSV file must contain columns: {', '.join(missing_basic)}"}), 400
        
        # Temukan sensor columns (fleksibel, bisa 1–7)
        sensor_columns = []
        for i in range(1, 8):
            for col in df.columns:
                if f'CH{i}' in col.upper() or f'CHANNEL {i}' in col.upper() or f'SENSOR {i}' in col.upper():
                    sensor_columns.append((i, col))
                    break
        
        if not sensor_columns:
            return jsonify({"status": "error", "message": "CSV must contain at least one sensor column (CH1–CH7)"}), 400
        
        print(f"[UPLOAD] Found sensor columns: {sensor_columns}")
        
        # Proses baris-baris CSV
        data = []
        for index, row in df.iterrows():
            try:
                sensor_values = {}
                for sensor_num, col_name in sensor_columns:
                    try:
                        value = float(row[col_name]) if pd.notna(row[col_name]) else 0.0
                    except (ValueError, TypeError):
                        value = 0.0
                    sensor_values[f'ch{sensor_num}'] = value
                
                data_row = {
                    'id': int(row['ID']) if pd.notna(row['ID']) else index + 1,
                    'date': str(row['Date']) if pd.notna(row['Date']) else '',
                    'time': str(row['Time']) if pd.notna(row['Time']) else '',
                    **sensor_values
                }
                data.append(data_row)
            except Exception as e:
                print(f"[UPLOAD] Error processing row {index}: {e}")
                continue
        
        # Cleanup
        try:
            os.remove(filepath)
        except:
            pass
        
        return jsonify({
            "status": "success",
            "message": f"CSV file processed successfully. {len(data)} records loaded.",
            "data": data,
            "filename": file.filename
        })
    
    except Exception as e:
        print(f"[UPLOAD] Critical error in upload_csv: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# Routes untuk halaman
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/settings')
def settings():
    try:
        print("[SETTINGS] Loading settings page...")
        
        # Load current settings from database
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        # Get sensor settings
        c.execute('''SELECT sensor_number, sensor_name, enabled, min_value, max_value, unit 
                     FROM sensor_settings ORDER BY sensor_number''')
        sensor_rows = c.fetchall()
        
        # Get engine settings
        c.execute('''SELECT e_speed, e_load, e_fuelrate, e_runhour, e_oilpressure, e_ip 
                     FROM engine_settings ORDER BY id DESC LIMIT 1''')
        engine_row = c.fetchone()
        
        # Get powermeter settings
        c.execute('''SELECT pm_current, pm_voltage, pm_r, pm_q, pm_s, pm_ip 
                     FROM powermeter_settings ORDER BY id DESC LIMIT 1''')
        powermeter_row = c.fetchone()
        
        conn.close()
        
        # Prepare sensor settings dictionary (using 'sensors' key to match template)
        sensors = {}
        for row in sensor_rows:
            sensor_number, sensor_name, enabled, min_value, max_value, unit = row
            sensors[f"sensor{sensor_number}"] = {
                "name": sensor_name or f"Sensor {sensor_number}",
                "enabled": bool(enabled),
                "min": float(min_value) if min_value is not None else 0.0,
                "max": float(max_value) if max_value is not None else 100.0,
                "unit": unit or ""
            }
        
        # Prepare engine settings dictionary (using 'engine' key to match template)
        engine = {}
        if engine_row:
            engine = {
                "e_speed": engine_row[0],
                "e_load": engine_row[1],
                "e_fuelrate": engine_row[2],
                "e_runhour": engine_row[3],
                "e_oilpressure": engine_row[4],
                "e_ip": engine_row[5]
            }
        
        # Prepare powermeter settings dictionary (using 'powermeter' key to match template)
        powermeter = {}
        if powermeter_row:
            powermeter = {
                "pm_current": powermeter_row[0],
                "pm_voltage": powermeter_row[1],
                "pm_r": powermeter_row[2],
                "pm_q": powermeter_row[3],
                "pm_s": powermeter_row[4],
                "pm_ip": powermeter_row[5]
            }
        
        print(f"[SETTINGS] Loaded {len(sensors)} sensor settings")
        print(f"[SETTINGS] Engine settings: {'Found' if engine else 'Not found'}")
        print(f"[SETTINGS] Powermeter settings: {'Found' if powermeter else 'Not found'}")
        
        return render_template('settings.html', 
                             sensors=sensors,
                             engine=engine,
                             powermeter=powermeter)
                             
    except Exception as e:
        print(f"[SETTINGS ERROR] Error loading settings page: {e}")
        import traceback
        traceback.print_exc()
        
        # Return template with empty settings on error
        return render_template('settings.html', 
                             sensors={},
                             engine={},
                             powermeter={})

# Initialize system state on startup
running = get_system_state()

if __name__ == '__main__':
    print(f"[STARTUP] System state: {'RUNNING' if running else 'STOPPED'}")
    print(f"[STARTUP] Current interval: {secTimeInterval} seconds")
    print(f"[STARTUP] Database: {DATABASE}")
    print(f"[STARTUP] Download folder: {DOWNLOAD_FOLDER}")
    print(f"[STARTUP] Upload folder: {UPLOAD_FOLDER}")
    print(f"[STARTUP] USB paths: {USB_PATHS}")
    
    # Start data collection threads if system was running
    if running:
        print("[STARTUP] Starting data collection threads...")
        basic_thread = threading.Thread(target=read_basic_sensor_data)
        basic_thread.daemon = True
        basic_thread.start()
        
        advanced_thread = threading.Thread(target=read_advanced_data)
        advanced_thread.daemon = True
        advanced_thread.start()
    
    app.run(host='0.0.0.0', port=5000, debug=False)
