#!/usr/bin/env python3
"""Construit l'outil de saisie hors ligne : un seul fichier HTML autonome (CSS, JS, images intégrés),
puis le ZIP à distribuer. Usage : python3 scripts/build_outil.py  (depuis la racine du projet)"""
import base64, re, zipfile, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "outil.html").read_text(encoding="utf-8")
def data_uri(p):
    return "data:image/png;base64," + base64.b64encode((root / p).read_bytes()).decode()
html = re.sub(r'<link rel="stylesheet" href="styles.css">', lambda m: "<style>\n" + (root / "styles.css").read_text(encoding="utf-8") + "\n</style>", html)
for js in ("trame.js", "questionnaire.js"):
    code = (root / js).read_text(encoding="utf-8").replace("</script", "<\\/script")
    html = html.replace(f'<script src="{js}"></script>', "<script>\n" + code + "\n</script>")
for img in ("assets/logo-noir.png", "assets/logo-blanc.png", "assets/favicon.png"):
    html = html.replace(f'"{img}"', '"' + data_uri(img) + '"')
assert "src=\"" not in re.sub(r'src="data:[^"]+"', "", html), "ressource externe restante"
assert not re.search(r"https?://(?!playbacktrice\.github\.io/matrice-playback-solutions/)", html.replace("http://www.w3.org", "")), "URL externe inattendue"
out_dir = root / "outil"; out_dir.mkdir(exist_ok=True)
name = "Demarche-de-rapprochement"
html_name = "Ouvrir - Démarche de rapprochement.html"
lisez = (root / "LISEZ-MOI.txt").read_text(encoding="utf-8")
zpath = out_dir / f"{name}-Playback-Solutions.zip"
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(f"{name}/{html_name}", html)
    z.writestr(f"{name}/LISEZ-MOI.txt", lisez)
print(zpath, zpath.stat().st_size, "octets")
