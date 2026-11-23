"""
One-click launcher for Local AI Video Clipper & Repurposing Engine.
Performs system health checks (FFmpeg, Python, CUDA/CPU, Ollama) and starts web server.
"""
import sys
import subprocess
import webbrowser
from pathlib import Path

def print_banner():
    print(r"""
========================================================================
       __                    __      ___    ____     ________ _                     
      / /   ____  _________ _/ /     /   |  /  _/    / ____/ (_)___  ____  ___  _____
     / /   / __ \/ ___/ __ `/ /     / /| |  / /     / /   / / / __ \/ __ \/ _ \/ ___/
    / /___/ /_/ / /__/ /_/ / /     / ___ |_/ /     / /___/ / / /_/ / /_/ /  __/ /    
   /_____/\____/\___/\__,_/_/     /_/  |_/___/     \____/_/_/ .___/ .___/\___/_/     
                                                           /_/   /_/                 
========================================================================
   100% Free & Self-Hosted Short-Form Video Repurposing Engine
   Zero API Costs | Local faster-whisper | Local Ollama | FFmpeg
========================================================================
""")

def check_dependencies():
    print("[*] Running system diagnostics...")
    
    # 1. Check FFmpeg
    try:
        res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0:
            print("  [+] FFmpeg: INSTALLED & READY")
        else:
            print("  [!] FFmpeg warning: command returned error")
    except Exception:
        print("  [-] ERROR: FFmpeg is not found in system PATH. Please ensure FFmpeg is installed.")

    # 2. Check Python packages
    try:
        import faster_whisper
        import yt_dlp
        import fastapi
        import uvicorn
        print("  [+] Core Python Libraries: INSTALLED & READY")
    except ImportError as e:
        print(f"  [-] Missing Python library: {e}. Please run: pip install -r requirements.txt")

    # 3. Check Hardware (CUDA vs CPU)
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            print(f"  [+] Acceleration: NVIDIA GPU DETECTED ({gpu_name})")
        else:
            print("  [i] Acceleration: CPU Mode (Multi-threaded & CTranslate2 optimized)")
    except Exception:
        print("  [i] Acceleration: CPU Mode")

    # 4. Check Ollama
    try:
        import requests
        resp = requests.get("http://localhost:11434/api/tags", timeout=1.5)
        if resp.status_code == 200:
            models = [m.get("name") for m in resp.json().get("models", [])]
            print(f"  [+] Local Ollama: ONLINE (Available Models: {', '.join(models) if models else 'None pulled yet'})")
        else:
            print("  [!] Local Ollama: Server responded with non-200. Heuristic fallback will be used.")
    except Exception:
        print("  [i] Local Ollama: Offline. Smart rule-based heuristic hook detector will be used automatically.")

    print("\n[*] Starting Local Web Server at: http://127.0.0.1:8000 ...")
    print("[*] Press Ctrl+C anytime to stop.\n")

if __name__ == "__main__":
    print_banner()
    check_dependencies()
    
    import uvicorn
    # Open browser automatically after a short delay
    def open_browser():
        import time
        time.sleep(1.2)
        try:
            webbrowser.open("http://127.0.0.1:8000")
        except Exception:
            pass

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
