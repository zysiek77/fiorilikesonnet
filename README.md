# Bank credit limits and exposure (SAPUI5 Fiori Elements + CAP)

Aplikacja w stylu SAP Fiori Elements (List Report + Object Page) do importu plików CSV z banku
i symulacji wysyłki do SAP:

- **aktualizacji limitu kredytowego** (CR limit) dla business partnera,
- **aktualizacji zewnętrznego exposure** (CR exposure) dla business partnera.

Komunikacja z SAP jest symulowana: losowe błędy łączności i opóźnienia są konfigurowalne.
Błąd jednej operacji nie zatrzymuje procesu, system przechodzi do kolejnej operacji.

### Nawigacja

Z Object Page wracasz do listy przyciskiem **Back to list** w nagłówku.

## Uruchomienie

Wymagania: Node.js 20 lub nowszy, dostęp do internetu (UI5 ładowany z `ui5.sap.com`).

```bash
npm install
npm start            # wdraża bazę SQLite (db.sqlite) i uruchamia serwer na http://localhost:4004
npm test             # testy jednostkowe parsera CSV i silnika przetwarzania
```

Aplikacja: `http://localhost:4004/bp-credit/webapp/index.html` (port zależy od konfiguracji CAP).


### Konfiguracja symulacji SAP

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `SAP_FAILURE_RATE` | `0.2` | prawdopodobieństwo błędu łączności pojedynczej operacji (0–1) |
| `SAP_LATENCY_MS` | `20` | czas odpowiedzi symulowanego SAP w ms |

## Procesy i statusy

### Import pliku (`Import CSV`)

Plik CSV z kolumnami w kolejności:

| # | Kolumna | Uwagi |
|---|---|---|
| 1 | kod jednostki gospodarczej | tekst |
| 2 | obszar kontroli kredytowej | tekst |
| 3 | kod BP | tekst |
| 4 | nazwa BP | tekst, może zawierać `;` w cudzysłowie |
| 5 | CR limit | kwota |
| 6 | CR exposure | kwota |

- Separator: `;` lub `,` (wybierany automatycznie).
- Nagłówek jest pomijany, jeśli kolumny kwot zawierają litery.
- Kwoty: przecinek jako separator dziesiętny (`1 250 000,00`) lub kropka (`1250000.00`).

**Walidacja wierszy.** Wszystkie wiersze pliku są wczytywane. Wiersz, który nie przechodzi walidacji,
dostaje `validationError` (opis błędu) i status `Incorrect` na obu statusach linii. Takie linie są
pomijane przy przetwarzaniu i nigdy nie są wysyłane do SAP. Reguły:

- dokładnie 6 kolumn,
- jednostka gospodarcza, obszar kontroli kredytowej i kod BP są wypełnione,
- CR limit i CR exposure są poprawnymi kwotami,
- **jedna jednostka gospodarcza na plik**: jednostką pliku jest najczęściej występująca jednostka
  wśród poprawnych wierszy; wiersze z inną jednostką są `Incorrect`.

Plik jest odrzucany w całości (`ParseError`) tylko wtedy, gdy jest pusty albo nie zawiera
żadnego wiersza danych.

**Nagłówek pliku** pokazuje statystyki: `Rows in file` (wszystkie wiersze), `Incorrect rows`
(wiersze z błędem walidacji), `Limit updated` i `Exposure updated`.

### Status pliku

| Status | Znaczenie | Dostępna akcja |
|---|---|---|
| `Parsed` | plik zaimportowany, linie czekają na wysyłkę | Process file |
| `Processing` | przetwarzanie w toku (stan przejściowy) | — |
| `Completed` | wszystkie operacje limit i exposure wysłane | — |
| `CompletedWithErrors` | część operacji nie powiodła się | Retry failed lines |
| `ParseError` | plik pusty lub bez wierszy danych, nic nie zaimportowano | — |

### Statusy linii BP (dwa niezależne)

- `limitStatus` – aktualizacja limitu: `Pending` / `Sent` / `Failed` / `Incorrect`
- `exposureStatus` – aktualizacja exposure: `Pending` / `Sent` / `Failed` / `Incorrect`

`Incorrect` oznacza błąd walidacji w pliku (linia pomijana, nie podlega ponawianiu).
Poprawić ją można tylko w pliku źródłowym z banku, a następnie zaimportować plik ponownie.

Dla każdej linii, w kolejności: najpierw limit, potem exposure. Błąd łączności oznacza
`Failed` tylko dla tej operacji, a system przechodzi dalej (również do exposure, gdy limit się nie udał).

### Ponawianie

`Retry failed lines` wysyła ponownie wyłącznie operacje w statusie `Failed` lub `Pending`.
Linie `Incorrect` są pomijane.
Operacje już `Sent` nie są wysyłane ponownie. Liczniki prób (`limitAttempts`, `exposureAttempts`)
i ostatni błąd (`lastError`) są zapisywane na linii.

**Po zmianie wersji:** jeśli masz `db.sqlite` z wcześniejszej wersji aplikacji, usuń plik
(`rm db.sqlite`) przed `npm start`, bo zmienił się schemat tabel.

## Architektura

```
db/schema.cds              model danych: Files (pliki), BpLines (linie BP)
srv/service.cds            serwis OData V4 /credit (Files, BpLines, action importCsv)
srv/annotations.cds        adnotacje UI (Fiori Elements: LineItem, Facets, Identification)
srv/service.js             handlery: import, process, retry
srv/lib/csv.js             parser CSV (bez zależności od bazy)
srv/lib/processing.js      silnik przetwarzania operacji i podsumowanie statusu pliku
srv/lib/sap-simulator.js   symulacja interfejsów SAP (limit, exposure)
app/bp-credit/webapp/      aplikacja SAPUI5: manifest (List Report + Object Page), dialog importu
```

## Założenia do weryfikacji

- Kolejność kolumn w CSV i separator dziesiętny — jak w opisie (przykład w `samples/`).
- Plik źródłowy zawiera jedną jednostkę gospodarczą. Jeśli bank wysyła kilka jednostek w jednym
  pliku, należy to potwierdzić: obecnie wiersze innych jednostek są `Incorrect`.
- Linie w tabeli nie są sortowane po numerze wiersza (brak wpływu na przetwarzanie).
- Przetwarzanie jest synchroniczne (akcja czeka na zakończenie); w produkcji wymagałoby kolejki
  i zadań w tle.
- Kraj wybierany przy imporcie (lista PL/DE/CZ/SK/HU) służy do filtrowania; nie wpływa na wysyłkę.
- Symulacja SAP nie rozróżnia błędów biznesowych od technicznych: każdy błąd to błąd łączności
  i jest ponawialny.
