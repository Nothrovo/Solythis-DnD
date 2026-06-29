#!/usr/bin/env python3
"""
Solythis D&D — Character Database Sync Script
=============================================
Memantau folder CharSprite/, Charsheet/, dan Charbackstory/
lalu secara otomatis memperbarui database.json.

Cara Pakai:
    python sync.py              # Mode watch (terus berjalan)
    python sync.py --once       # Generate sekali lalu berhenti

Instalasi dependency:
    pip install watchdog
"""

import json
import os
import sys
import time
import threading
from pathlib import Path
from datetime import datetime
from difflib import SequenceMatcher

# ── Konfigurasi Path ────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent.resolve()
CHARSHEET_DIR = BASE_DIR / "Charsheet"
SPRITE_DIR    = BASE_DIR / "CharSprite"
BACKSTORY_DIR = BASE_DIR / "Charbackstory"
OUTPUT_FILE   = BASE_DIR / "database.json"

SPRITE_EXTENSIONS   = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'}
BACKSTORY_EXTENSIONS = {'.md', '.txt'}

# ── Helper ──────────────────────────────────────────────────────────────────

def _similarity(a: str, b: str) -> float:
    """Menghitung kemiripan dua string (0.0 – 1.0)."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def _first_name(name: str) -> str:
    return name.split()[0] if name.split() else name

def _find_best_match(target_name: str, candidates: list[Path]) -> Path | None:
    """
    Mencari file terbaik yang namanya paling mirip dengan target_name.
    Menggunakan kombinasi exact match → first-name match → fuzzy similarity.
    """
    target_norm = target_name.lower().replace(' ', '')
    target_first = _first_name(target_name).lower()

    best_score = 0.0
    best_match = None

    for candidate in candidates:
        stem = candidate.stem
        stem_norm = stem.lower().replace(' ', '')
        stem_first = _first_name(stem).lower()

        # Exact match (case-insensitive, ignore spaces)
        if stem_norm == target_norm:
            return candidate

        # First-name exact match
        if stem_first == target_first:
            score = 0.9
        else:
            # Fuzzy similarity
            score = max(
                _similarity(stem_norm, target_norm),
                _similarity(stem_first, target_first),
            )

        if score > best_score:
            best_score = score
            best_match = candidate

    # Threshold: harus di atas 0.75 agar tidak salah tebak
    return best_match if best_score >= 0.75 else None

# ── Core Logic ──────────────────────────────────────────────────────────────

def find_sprite(char_name: str, party_name: str) -> str | None:
    """Mencari sprite yang cocok untuk karakter di folder party-nya."""
    party_sprite_dir = SPRITE_DIR / party_name
    if not party_sprite_dir.exists():
        return None

    candidates = [
        f for f in party_sprite_dir.iterdir()
        if f.is_file() and f.suffix.lower() in SPRITE_EXTENSIONS
    ]
    if not candidates:
        return None

    match = _find_best_match(char_name, candidates)
    if match:
        return str(match.relative_to(BASE_DIR))
    return None

def find_backstory(char_name: str) -> tuple[bool, str | None]:
    """Mencari file backstory (.md / .txt) untuk karakter."""
    if not BACKSTORY_DIR.exists():
        return False, None

    candidates = [
        f for f in BACKSTORY_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in BACKSTORY_EXTENSIONS
    ]
    if not candidates:
        return False, None

    match = _find_best_match(char_name, candidates)
    if match:
        return True, str(match.relative_to(BASE_DIR))
    return False, None

def load_charsheet(json_path: Path) -> dict | None:
    """Membaca dan memvalidasi file JSON karakter."""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"  [ERROR] Gagal parse {json_path.name}: {e}")
        return None
    except Exception as e:
        print(f"  [ERROR] Gagal baca {json_path.name}: {e}")
        return None

    for required_field in ('id', 'name', 'party'):
        if required_field not in data:
            print(f"  [WARN]  {json_path.name}: field '{required_field}' tidak ditemukan, dilewati.")
            return None

    return data

def generate_database() -> None:
    """Memindai semua folder dan memperbarui database.json."""
    timestamp = datetime.now().strftime('%H:%M:%S')
    print(f"\n[{timestamp}] Memperbarui database.json ...")

    if not CHARSHEET_DIR.exists():
        print(f"  [WARN] Folder Charsheet tidak ditemukan: {CHARSHEET_DIR}")
        return

    characters = []
    party_dirs = sorted(d for d in CHARSHEET_DIR.iterdir() if d.is_dir())

    if not party_dirs:
        print("  [WARN] Tidak ada subfolder party di dalam Charsheet/")

    for party_dir in party_dirs:
        party_name = party_dir.name
        json_files = sorted(party_dir.glob('*.json'))

        if not json_files:
            print(f"  [SKIP] {party_name}: tidak ada file .json")
            continue

        for json_file in json_files:
            data = load_charsheet(json_file)
            if not data:
                continue

            char_name = data['name']

            # Cari sprite
            sprite_path = find_sprite(char_name, party_name)
            data['sprite_path'] = sprite_path
            if sprite_path:
                print(f"  [OK]   {char_name}: sprite → {sprite_path}")
            else:
                print(f"  [WARN] {char_name}: sprite tidak ditemukan")

            # Cari backstory
            has_backstory, backstory_path = find_backstory(char_name)
            data['has_deep_backstory'] = has_backstory
            data['backstory_path'] = backstory_path
            if has_backstory:
                print(f"  [OK]   {char_name}: backstory → {backstory_path}")

            characters.append(data)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(characters, f, ensure_ascii=False, indent=2)

    print(f"  → {len(characters)} karakter ditulis ke {OUTPUT_FILE.name}")

# ── Watchdog Integration ─────────────────────────────────────────────────────

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler

    class _DebounceHandler(FileSystemEventHandler):
        """Handler dengan debounce 0.5 detik agar tidak spam regenerasi."""
        def __init__(self):
            self._timer: threading.Timer | None = None
            self._lock = threading.Lock()

        def _schedule(self, event_desc: str):
            print(f"  [EVENT] {event_desc}")
            with self._lock:
                if self._timer:
                    self._timer.cancel()
                self._timer = threading.Timer(0.5, generate_database)
                self._timer.start()

        def on_created(self, event):
            if not event.is_directory:
                self._schedule(f"Dibuat: {Path(event.src_path).name}")

        def on_modified(self, event):
            if not event.is_directory:
                self._schedule(f"Diubah: {Path(event.src_path).name}")

        def on_deleted(self, event):
            if not event.is_directory:
                self._schedule(f"Dihapus: {Path(event.src_path).name}")

        def on_moved(self, event):
            self._schedule(
                f"Dipindah: {Path(event.src_path).name} → {Path(event.dest_path).name}"
            )

    WATCHDOG_AVAILABLE = True

except ImportError:
    WATCHDOG_AVAILABLE = False

# ── Entry Point ──────────────────────────────────────────────────────────────

def main():
    once_mode = '--once' in sys.argv

    print("=" * 55)
    print("  Solythis D&D — Character Database Sync")
    print("=" * 55)
    print(f"  Base dir : {BASE_DIR}")
    print(f"  Output   : {OUTPUT_FILE.name}")
    print()

    # Generasi awal
    generate_database()

    if once_mode:
        print("\n  Selesai. (mode --once)")
        return

    if not WATCHDOG_AVAILABLE:
        print("\n[ERROR] Library 'watchdog' tidak terinstal.")
        print("  Jalankan: pip install watchdog")
        print("  Lalu jalankan kembali script ini untuk mode watch otomatis.")
        return

    print(f"\n[WATCH] Memantau perubahan file...")
    print(f"  CharSprite   : {SPRITE_DIR.name}/")
    print(f"  Charsheet    : {CHARSHEET_DIR.name}/")
    print(f"  Charbackstory: {BACKSTORY_DIR.name}/")
    print("  Tekan Ctrl+C untuk berhenti.\n")

    handler = _DebounceHandler()
    observer = Observer()

    for watch_dir in (CHARSHEET_DIR, SPRITE_DIR, BACKSTORY_DIR):
        if watch_dir.exists():
            observer.schedule(handler, str(watch_dir), recursive=True)
        else:
            print(f"  [WARN] Folder tidak ditemukan, tidak dipantau: {watch_dir.name}/")

    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("\n[STOP] Sync dihentikan.")
    observer.join()

if __name__ == '__main__':
    main()
