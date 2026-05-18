# Draftsman

Single-page vanilla JS workboard with Gantt timeline.

## Running

Chrome requires ES modules to be served over HTTP (not `file://`).

```bash
python3 -m http.server 5173
```

Then open:

- **App:** http://localhost:5173
- **Tests:** http://localhost:5173/test/index.html

## Usage

1. Click **Upload files** and drop (or browse for) both CSV files:
   - `workboard_stage_templates.csv`
   - `workboard_stage_dates.csv`
2. Click **Load planner**.
3. Sort, reorder, and edit priorities as needed.
4. Click **Export CSV** to download the updated stage-dates file.

## File structure

```
index.html          — SPA shell
styles.css          — Layout and Gantt bar styles
app.js              — Entry point, UI wiring
csv.js              — CSV parsing and validation
dates.js            — Working-day arithmetic
scheduler.js        — Stage cascade recalculation
gantt.js            — Timeline rendering
export.js           — CSV export
test/
  index.html        — Mocha test runner
  csv.test.js
  dates.test.js
  scheduler.test.js
  export.test.js
  gantt.test.js
testdata/
  workboard_stage_templates.csv
  workboard_stage_dates.csv
```
