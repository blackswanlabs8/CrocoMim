from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'сrocomim.html'

def main():
    html = HTML_PATH.read_text(encoding='utf-8')
    checks = {
        "main_has_quick_button": 'id="modeQuick"' in html,
        "main_has_team_button": 'id="goTeam"' in html,
        "timer_minus_icon": 'id="quickTimeMinus"' in html and '−</button>' in html,
        "timer_plus_icon": 'id="quickTimePlus"' in html and '+</button>' in html,
        "points_header": '>Очки до победы<' in html,
        "no_team_name_label": 'Имя команды' not in html,
        "team_delete_icon": 'class="team-delete"' in html,
        "rename_button_bottom": 'id="teamRename"' in html,
    }
    failed = [name for name, ok in checks.items() if not ok]
    if failed:
        print("FAILED checks:")
        for name in failed:
            print(f" - {name}")
        raise SystemExit(1)
    print("All requirements checks passed.")

if __name__ == "__main__":
    main()
