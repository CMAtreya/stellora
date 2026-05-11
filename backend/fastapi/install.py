import subprocess
import sys

def install():
    print("Starting install...")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "yt-dlp", "google-generativeai"],
            capture_output=True,
            text=True,
            check=True
        )
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        print("Success!")
    except subprocess.CalledProcessError as e:
        print("Failed with code:", e.returncode)
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)

if __name__ == "__main__":
    install()
