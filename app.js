/**
 * app.js — Entry point
 *
 * Wires together the upload pop-over, workboard, Gantt, sorting,
 * drag-and-drop, and export button.
 */

import { parseTemplates, parseStageDates } from "./csv.js";
import { renderTimeline } from "./gantt.js";
import { recalculateFromStage } from "./scheduler.js";
import { exportStageDates, triggerDownload } from "./export.js";

// Application state
const state = {
  templates: null, // Array<StageTemplate>
  jobs: null, // Array<Job>
  workingDaysMode: true,
  dirty: false,
};

document.addEventListener("DOMContentLoaded", () => {
  // TODO: initialise UI components
});
