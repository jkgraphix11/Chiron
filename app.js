const questions = [
  {
    text: "Is the shortness of breath worse with exertion than at rest?",
    purpose: "Confirm high-yield symptom cluster",
    rationale:
      "The Q&A surface asks for the single most useful coded confirmation, then the differential updates in place.",
    weights: { anemia: 14, thyroid: 4, anxiety: -2, infection: -3 },
  },
  {
    text: "Has there been unusually heavy menstrual bleeding or recent visible blood loss?",
    purpose: "Test active anemia branch",
    rationale:
      "A promoted disease thread can stay active while the next coded answer refines its phase-specific workup.",
    weights: { anemia: 18, thyroid: -1, anxiety: -3, infection: -2 },
  },
  {
    text: "Is there heat intolerance, tremor, or unexplained weight change?",
    purpose: "Check alternate endocrine path",
    rationale:
      "Under-examined diseases remain visible. They are not silently eliminated when another disease rises.",
    weights: { anemia: -4, thyroid: 16, anxiety: 5, infection: -2 },
  },
  {
    text: "Are there fever, chills, or a new productive cough?",
    purpose: "Screen exception-adjacent infection signals",
    rationale:
      "The exception overlay remains available even when the concise differential is the primary view.",
    weights: { anemia: -2, thyroid: -1, anxiety: -2, infection: 18 },
  },
];

const initialDiseases = [
  {
    id: "anemia",
    name: "Iron-deficiency anemia",
    score: 58,
    climb: 24,
    tier: "watch",
    summary: "Fatigue and exertional dyspnea fit; bleeding history still under-examined.",
    path: "Confirmation gate: exertional dyspnea + blood-loss screen. Next: CBC/ferritin lens if promoted.",
    action: "Track CBC and ferritin as phase-appropriate workup.",
    pending: ["CBC", "Ferritin"],
  },
  {
    id: "thyroid",
    name: "Thyroid dysfunction",
    score: 42,
    climb: 30,
    tier: "watch",
    summary: "Fatigue overlaps; endocrine branch needs targeted symptom confirmation.",
    path: "Confirmation gate: heat intolerance, tremor, and weight change. Next: TSH/free T4 lens.",
    action: "Track TSH with reflex free T4 if branch remains active.",
    pending: ["TSH"],
  },
  {
    id: "anxiety",
    name: "Panic or anxiety physiology",
    score: 35,
    climb: 20,
    tier: "unlikely",
    summary: "Lightheadedness overlaps, but exertional pattern keeps it below active threshold.",
    path: "Confirmation gate: episodic onset, palpitations, situational triggers. Reversible if new support appears.",
    action: "Hold as visible differential item; no active thread at current threshold.",
    pending: [],
  },
  {
    id: "infection",
    name: "Respiratory infection",
    score: 29,
    climb: 26,
    tier: "unlikely",
    summary: "No fever or cough so far. It remains visible because nothing is silently dropped.",
    path: "Confirmation gate: fever, cough, oxygen saturation, focal exam. Exception overlay if red flags appear.",
    action: "Watch for red-flag overlay; no active workup without supporting findings.",
    pending: [],
  },
];

const evidenceLabels = ["Exertional dyspnea", "Blood loss", "Endocrine signs", "Fever/cough"];

let state = {
  currentQuestion: 0,
  answers: [],
  diseases: structuredClone(initialDiseases),
  activeDiseaseId: "anemia",
  pending: [],
  matrix: false,
};

const qaPanel = document.getElementById("qaPanel");
const workspace = document.getElementById("workspace");
const resizer = document.getElementById("resizer");
const questionCounter = document.getElementById("questionCounter");
const questionPurpose = document.getElementById("questionPurpose");
const questionText = document.getElementById("questionText");
const questionRationale = document.getElementById("questionRationale");
const answerLog = document.getElementById("answerLog");
const diseaseList = document.getElementById("diseaseList");
const matrixView = document.getElementById("matrixView");
const pathTitle = document.getElementById("pathTitle");
const pathCopy = document.getElementById("pathCopy");
const jointActionList = document.getElementById("jointActionList");
const pendingList = document.getElementById("pendingList");
const threadCount = document.getElementById("threadCount");
const pendingCount = document.getElementById("pendingCount");
const engineState = document.getElementById("engineState");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function tierFor(score) {
  if (score >= 66) return "active";
  if (score >= 40) return "watch";
  return "unlikely";
}

function tierLabel(tier) {
  return tier === "active" ? "Promoted" : tier === "watch" ? "Watch" : "Unlikely";
}

function answerLabel(answer) {
  if (answer === "yes") return "Yes";
  if (answer === "no") return "No";
  return "Not sure";
}

function applyAnswer(answer) {
  const question = questions[state.currentQuestion];
  const multiplier = answer === "yes" ? 1 : answer === "no" ? -0.72 : 0.24;
  state.answers.push({ question: question.text, answer, purpose: question.purpose });

  state.diseases = state.diseases
    .map((disease) => {
      const delta = Math.round((question.weights[disease.id] || 0) * multiplier);
      const score = clamp(disease.score + delta, 4, 96);
      const climb = clamp(disease.climb - (answer === "unknown" ? 2 : Math.abs(delta) / 2), 8, 38);
      return { ...disease, score, climb: Math.round(climb), tier: tierFor(score) };
    })
    .sort((a, b) => b.score - a.score);

  state.currentQuestion = Math.min(state.currentQuestion + 1, questions.length - 1);

  const promoted = state.diseases.filter((disease) => disease.tier === "active");
  promoted.forEach((disease) => {
    if (!state.pending.some((item) => item.diseaseId === disease.id) && disease.pending.length) {
      state.pending.push({
        id: `${disease.id}-${Date.now()}`,
        diseaseId: disease.id,
        disease: disease.name,
        tests: disease.pending,
        status: "pending",
      });
    }
  });

  state.activeDiseaseId = state.diseases[0].id;
  render();
}

function resetState() {
  state = {
    currentQuestion: 0,
    answers: [],
    diseases: structuredClone(initialDiseases),
    activeDiseaseId: "anemia",
    pending: [],
    matrix: false,
  };
  render();
}

function renderQuestion() {
  const question = questions[state.currentQuestion];
  questionCounter.textContent = `Question ${state.currentQuestion + 1} of ${questions.length}`;
  questionPurpose.textContent = question.purpose;
  questionText.textContent = question.text;
  questionRationale.textContent = question.rationale;

  answerLog.innerHTML = state.answers.length
    ? state.answers
        .map(
          (item) =>
            `<li><strong>${answerLabel(item.answer)}</strong> — ${item.purpose}<br><span>${item.question}</span></li>`,
        )
        .join("")
    : "<li>No coded answers selected yet.</li>";
}

function renderDiseases() {
  diseaseList.innerHTML = state.diseases
    .map(
      (disease) => `
        <article class="disease-row ${disease.id === state.activeDiseaseId ? "active" : ""}" data-disease-id="${disease.id}" tabindex="0">
          <div class="disease-main">
            <strong>${disease.name}</strong>
            <span>${disease.summary}</span>
          </div>
          <span class="tier ${disease.tier}">${tierLabel(disease.tier)}</span>
          <div class="score-stack">
            <span class="score-label">Score ${disease.score}</span>
            <div class="bar"><span style="width:${disease.score}%"></span></div>
          </div>
          <div class="score-stack">
            <span class="score-label">Climb +${disease.climb}</span>
            <div class="bar climb"><span style="width:${disease.climb * 2}%"></span></div>
          </div>
        </article>
      `,
    )
    .join("");

  const activeDisease = state.diseases.find((disease) => disease.id === state.activeDiseaseId) || state.diseases[0];
  pathTitle.textContent = activeDisease.name;
  pathCopy.textContent = activeDisease.path;

  const promotedCount = state.diseases.filter((disease) => disease.tier === "active").length;
  engineState.textContent = state.answers.length
    ? `Updated from ${state.answers.length} coded answer${state.answers.length === 1 ? "" : "s"}; surfaces retained their layout.`
    : "Initial state: ranked from intake findings.";
  threadCount.textContent = `${promotedCount} active`;
}

function renderMatrix() {
  const headers = ["Evidence", ...state.diseases.map((disease) => disease.name.split(" ")[0])];
  const cells = headers.map((label) => `<div class="matrix-cell header">${label}</div>`);
  evidenceLabels.forEach((evidence, rowIndex) => {
    cells.push(`<div class="matrix-cell header">${evidence}</div>`);
    state.diseases.forEach((disease) => {
      const value = Math.abs((questions[rowIndex]?.weights[disease.id] || 0) * 4);
      const signal = value > 48 ? "signal-high" : value > 20 ? "signal-mid" : "signal-low";
      cells.push(`<div class="matrix-cell ${signal}">${value > 48 ? "Strong" : value > 20 ? "Moderate" : "Low"}</div>`);
    });
  });
  matrixView.innerHTML = cells.join("");
  matrixView.classList.toggle("hidden", !state.matrix);
  diseaseList.classList.toggle("hidden", state.matrix);
}

function renderJointAction() {
  const active = state.diseases.filter((disease) => disease.tier === "active");
  jointActionList.innerHTML = active.length
    ? active
        .map(
          (disease) => `
            <article class="thread-card">
              <h3>${disease.name}</h3>
              <p>${disease.action}</p>
              <div class="thread-actions">
                <button class="action-button" data-path="${disease.id}" type="button">View Path</button>
                <button class="action-button primary" data-track="${disease.id}" type="button">Track Result</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<div class="empty-state">Diseases promoted past threshold appear here. Promotion is visible but not manually operated.</div>`;
}

function renderPending() {
  pendingCount.textContent = `${state.pending.filter((item) => item.status !== "entered").length} pending`;
  pendingList.innerHTML = state.pending.length
    ? state.pending
        .map((item) => {
          const ready = item.status === "ready";
          const entered = item.status === "entered";
          const className = entered ? "result-entered" : ready ? "result-ready" : "";
          const buttonText = item.status === "pending" ? "Mark Ready" : item.status === "ready" ? "Enter Result" : "Entered";
          return `
            <article class="pending-card ${className}">
              <h4>${item.disease}</h4>
              <p>${item.tests.join(" + ")} · ${entered ? "interpreted and reflected in surfaces" : ready ? "result ready for coded entry" : "awaiting result"}</p>
              <button class="action-button ${entered ? "" : "primary"}" data-pending="${item.id}" ${entered ? "disabled" : ""} type="button">${buttonText}</button>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state compact">No pending items yet.</div>`;
}

function render() {
  renderQuestion();
  renderDiseases();
  renderMatrix();
  renderJointAction();
  renderPending();
}

function openModal(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.showModal();
}

document.querySelectorAll(".answer-button").forEach((button) => {
  button.addEventListener("click", () => applyAnswer(button.dataset.answer));
});

document.getElementById("resetButton").addEventListener("click", resetState);

document.getElementById("contextToggle").addEventListener("click", () => {
  const context = document.getElementById("caseContext");
  const isCollapsed = context.classList.toggle("collapsed");
  document.getElementById("contextToggle").setAttribute("aria-expanded", String(!isCollapsed));
  document.getElementById("contextChevron").textContent = isCollapsed ? "Expand" : "Collapse";
});

diseaseList.addEventListener("click", (event) => {
  const row = event.target.closest(".disease-row");
  if (!row) return;
  state.activeDiseaseId = row.dataset.diseaseId;
  render();
});

diseaseList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest(".disease-row");
  if (!row) return;
  state.activeDiseaseId = row.dataset.diseaseId;
  render();
});

jointActionList.addEventListener("click", (event) => {
  const pathId = event.target.dataset.path;
  const trackId = event.target.dataset.track;
  if (pathId) {
    state.activeDiseaseId = pathId;
    render();
  }
  if (trackId) {
    const disease = state.diseases.find((item) => item.id === trackId);
    if (disease && disease.pending.length && !state.pending.some((item) => item.diseaseId === disease.id)) {
      state.pending.push({
        id: `${disease.id}-${Date.now()}`,
        diseaseId: disease.id,
        disease: disease.name,
        tests: disease.pending,
        status: "pending",
      });
      render();
    }
  }
});

pendingList.addEventListener("click", (event) => {
  const id = event.target.dataset.pending;
  if (!id) return;
  const item = state.pending.find((entry) => entry.id === id);
  if (!item) return;
  item.status = item.status === "pending" ? "ready" : "entered";
  if (item.status === "entered") {
    const disease = state.diseases.find((entry) => entry.id === item.diseaseId);
    if (disease) {
      disease.score = clamp(disease.score + 5, 4, 96);
      disease.climb = clamp(disease.climb - 6, 6, 38);
      disease.summary = "Result entered; the same surfaces now reflect the updated state.";
    }
  }
  render();
});

document.getElementById("conciseButton").addEventListener("click", () => {
  state.matrix = false;
  document.getElementById("conciseButton").classList.add("active");
  document.getElementById("matrixButton").classList.remove("active");
  render();
});

document.getElementById("matrixButton").addEventListener("click", () => {
  state.matrix = true;
  document.getElementById("matrixButton").classList.add("active");
  document.getElementById("conciseButton").classList.remove("active");
  render();
});

document.getElementById("whyButton").addEventListener("click", () => {
  const question = questions[state.currentQuestion];
  openModal(
    "Explain",
    `<p><strong>Why this question:</strong> ${question.rationale}</p>
     <p>Appendix G limits Explain to justification: it provides the cited basis for a question, score change, or exclusion without becoming a separate workflow.</p>`,
  );
});

document.getElementById("exceptionsButton").addEventListener("click", () => {
  openModal(
    "Exceptions Overlay",
    `<p><strong>Current synthetic state:</strong> no critical exception is active.</p>
     <p>The overlay is represented as always available, matching Appendix G's direction that red flags are never hidden by rank or panel state.</p>`,
  );
});

document.getElementById("reportButton").addEventListener("click", () => {
  openModal(
    "Advisory Case Report",
    `<p><strong>Case report preview:</strong> synthetic findings, coded answers, ranked differential, visible exclusions, and tracked workup.</p>
     <p>This prototype keeps the report as a summary view. Live work continues in Q&A, Heat Map, and Joint Action.</p>`,
  );
});

document.getElementById("modalClose").addEventListener("click", () => modal.close());

let isDragging = false;

resizer.addEventListener("pointerdown", (event) => {
  isDragging = true;
  resizer.classList.add("dragging");
  resizer.setPointerCapture(event.pointerId);
});

resizer.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  const rect = workspace.getBoundingClientRect();
  const width = clamp(event.clientX - rect.left, 300, 520);
  workspace.style.setProperty("--qa-width", `${width}px`);
});

resizer.addEventListener("pointerup", () => {
  isDragging = false;
  resizer.classList.remove("dragging");
});

resizer.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const current = Number.parseInt(getComputedStyle(workspace).getPropertyValue("--qa-width"), 10) || 350;
  const next = clamp(current + (event.key === "ArrowRight" ? 20 : -20), 300, 520);
  workspace.style.setProperty("--qa-width", `${next}px`);
});

render();
