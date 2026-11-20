# Lift

Lift ist eine deutschsprachige Progressive Web App für Krafttraining. Sie unterstützt feste Trainingstage, Powerlifting, frei zusammenstellbare Wildcard-Einheiten, Mobility und Fortschrittsauswertungen.

Dieses Repository enthält den Quellcode der [veröffentlichten Lift-App](https://lift-training.pplx.app/). Die App nutzt HTML, CSS und JavaScript ohne Build-Schritt. Trainingsdaten bleiben im Browser und lassen sich in der App als JSON exportieren und importieren.

## Lokal starten

```sh
git clone https://github.com/Hqvanna/Lift.git
cd Lift
python3 -m http.server 8000
```

Dann [http://localhost:8000](http://localhost:8000) öffnen. Die App über einen lokalen HTTP-Server starten, nicht per Doppelklick auf `index.html`, damit auch der Service Worker verfügbar ist.

## Mitwirken

1. Für eine Idee oder einen Fehler ein [Issue](https://github.com/Hqvanna/Lift/issues) eröffnen. Bei Fehlern bitte Browser, Betriebssystem und Schritte zur Reproduktion angeben.
2. Das Repository forken, einen Branch erstellen und die Änderung lokal testen.
3. Einen Pull Request gegen `main` öffnen und kurz beschreiben, was sich ändert und wie es getestet wurde.

Bitte keine persönlichen Trainingsexporte oder Zugangsdaten einchecken. Für reproduzierbare Tests synthetische Beispieldaten verwenden.

## Lizenz

Der Code steht unter der [MIT-Lizenz](LICENSE).
