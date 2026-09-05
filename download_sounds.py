"""
╔══════════════════════════════════════════════════════╗
║   Téléchargeur de sons — MyInstants Tendances FR     ║
║   - Télécharge uniquement les sons ≤ 5 secondes      ║
║   - Détecte les doublons (ex: "faah" ≈ "FAAAHHH")    ║
╚══════════════════════════════════════════════════════╝

Usage : python download_sounds.py
"""

import os
import re
import time
import unicodedata
import requests
from bs4 import BeautifulSoup
from mutagen.mp3 import MP3
from difflib import SequenceMatcher

# ─── CONFIGURATION ───────────────────────────────────────────
OUTPUT_DIR      = os.path.join(os.path.dirname(__file__), 'son')
MAX_DURATION    = 5.0          # secondes max
SIMILARITY_THRESHOLD = 0.75   # 0-1 : seuil de détection doublon
PAGES_TO_SCAN   = 30            # nombre de pages de tendances à scanner
DELAY_BETWEEN   = 0.4          # délai entre chaque téléchargement (s)
BASE_URL        = 'https://www.myinstants.com'
TRENDING_URL    = BASE_URL + '/fr/index/fr/?page={page}'
HEADERS         = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
# ─────────────────────────────────────────────────────────────


def strip_prefix(name: str) -> str:
    """Supprime le préfixe générique ajouté par MyInstants."""
    for prefix in ('jouer le son de ', 'play the sound of ', 'play '):
        if name.lower().startswith(prefix):
            return name[len(prefix):]
    return name


def normalize(name: str) -> str:
    """
    Normalise un nom pour la comparaison de doublons :
    - Supprime le préfixe MyInstants ('Jouer le son de ...')
    - Passe en minuscule
    - Supprime les accents
    - Garde uniquement les lettres/chiffres
    - Compresse les répétitions (faaah → fah, OOOOO → oo)
    """
    name = strip_prefix(name)
    # Minuscule + suppression des accents
    name = unicodedata.normalize('NFKD', name.lower())
    name = ''.join(c for c in name if not unicodedata.combining(c))
    # Garder seulement lettres et chiffres
    name = re.sub(r'[^a-z0-9]', '', name)
    # Compresser les caractères répétés (3+ → 2 max)
    name = re.sub(r'(.)\1{2,}', r'\1\1', name)
    return name


def is_duplicate(name: str, existing: list[str]) -> tuple[bool, str | None]:
    """Vérifie si 'name' est un doublon d'un des sons existants."""
    norm_new = normalize(name)
    if not norm_new:
        return False, None
    for ex in existing:
        norm_ex = normalize(ex)
        ratio = SequenceMatcher(None, norm_new, norm_ex).ratio()
        if ratio >= SIMILARITY_THRESHOLD:
            return True, ex
    return False, None


def get_duration(filepath: str) -> float | None:
    """Retourne la durée en secondes d'un fichier MP3, ou None si erreur."""
    try:
        return MP3(filepath).info.length
    except Exception:
        return None


def safe_filename(name: str) -> str:
    """Génère un nom de fichier valide depuis un nom de son."""
    name = unicodedata.normalize('NFKD', name)
    name = ''.join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r'[<>:"/\\|?*\n\r\t]', '', name)
    name = name.strip('. ')
    return name[:80] or 'son_inconnu'


def scrape_page(page: int) -> list[dict]:
    """Récupère la liste des sons sur une page de tendances."""
    url = TRENDING_URL.format(page=page)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  ❌ Impossible de charger la page {page} : {e}")
        return []

    soup = BeautifulSoup(resp.text, 'html.parser')
    sounds = []

    for instant in soup.find_all('div', class_='instant'):
        btn = instant.find('button', class_='small-button')
        if not btn:
            continue
        name = (btn.get('title') or btn.get_text()).strip()
        if not name:
            continue
        onclick = btn.get('onclick', '')
        match = re.search(r"play\('([^']+)'", onclick)
        if not match:
            continue
        mp3_url = BASE_URL + match.group(1)
        sounds.append({'name': name, 'url': mp3_url})

    return sounds


def download_sounds():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Charger les noms existants
    existing_names = [
        os.path.splitext(f)[0]
        for f in os.listdir(OUTPUT_DIR)
        if f.lower().endswith('.mp3')
    ]
    print(f"📁 Dossier cible : {OUTPUT_DIR}")
    print(f"📂 Sons déjà présents : {len(existing_names)}\n")

    # Scraper toutes les pages
    all_sounds = []
    for page in range(1, PAGES_TO_SCAN + 1):
        print(f"🔍 Scan de la page {page}/{PAGES_TO_SCAN}...")
        sounds = scrape_page(page)
        all_sounds.extend(sounds)
        time.sleep(0.5)

    print(f"\n📋 {len(all_sounds)} sons trouvés au total\n")
    print("─" * 55)

    stats = {'ok': 0, 'trop_long': 0, 'doublon': 0, 'erreur': 0}
    tmp = os.path.join(OUTPUT_DIR, '_temp_download.mp3')

    for sound in all_sounds:
        name = sound['name']
        url  = sound['url']

        # ── Vérification doublon ──
        dup, match_name = is_duplicate(name, existing_names)
        if dup:
            print(f"  ⏭  Doublon : « {name} »  ≈  « {match_name} »")
            stats['doublon'] += 1
            continue

        # ── Téléchargement ──
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
        except Exception as e:
            print(f"  ❌ Erreur DL « {name} » : {e}")
            stats['erreur'] += 1
            continue

        with open(tmp, 'wb') as f:
            f.write(resp.content)

        # ── Vérification durée ──
        duration = get_duration(tmp)
        if duration is None:
            print(f"  ⚠️  Durée illisible : « {name} » — ignoré")
            os.remove(tmp)
            stats['erreur'] += 1
            continue

        if duration > MAX_DURATION:
            print(f"  ⏱  Trop long ({duration:.1f}s) : « {name} »")
            os.remove(tmp)
            stats['trop_long'] += 1
            continue

        # ── Sauvegarde ──
        clean_name = strip_prefix(name)  # Retire "Jouer le son de "
        fname = safe_filename(clean_name) + '.mp3'
        dest  = os.path.join(OUTPUT_DIR, fname)
        # Éviter les collisions de noms de fichiers
        counter = 1
        while os.path.exists(dest):
            dest = os.path.join(OUTPUT_DIR, f"{safe_filename(name)}_{counter}.mp3")
            counter += 1

        os.rename(tmp, dest)
        existing_names.append(name)
        print(f"  ✅ ({duration:.1f}s) « {name} »")
        stats['ok'] += 1
        time.sleep(DELAY_BETWEEN)

    # Nettoyage fichier temp si erreur en cours de route
    if os.path.exists(tmp):
        os.remove(tmp)

    print("\n" + "═" * 55)
    print(f"  ✅ Téléchargés    : {stats['ok']}")
    print(f"  ⏱  Trop longs     : {stats['trop_long']}")
    print(f"  ⏭  Doublons       : {stats['doublon']}")
    print(f"  ❌ Erreurs        : {stats['erreur']}")
    print("═" * 55)
    print(f"\n🎵 Sons dans le dossier : {len(os.listdir(OUTPUT_DIR))} fichiers")


if __name__ == '__main__':
    download_sounds()
