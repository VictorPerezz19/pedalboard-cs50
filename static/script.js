/* Virtual Pedalboard & Tone Tracker - lógica del Builder (Vanilla JS) */
"use strict";

// ------------------------------------------------------------------ Config
const MAX_ITEMS = 12;

// Perillas por pieza. Si el nombre no está, se usa el valor por defecto de su tipo.
const KNOBS_BY_NAME = {
    "Blackstar Debut 50R": ["Gain", "Bass", "Middle", "Treble", "Volume", "Reverb"],
    "Boss DS-2": ["Level", "Tone", "Dist"],
    "Mooer Pure Boost": ["Gain"],
    "Behringer UC200": ["Level", "EQ", "Rate", "Depth"],
};
const KNOBS_BY_TYPE = {
    amp: ["Gain", "Bass", "Middle", "Treble", "Volume"],
    pedal: ["Level", "Tone", "Gain"],
};
const TYPE_LABELS = [["amp", "Amplificadores"], ["pedal", "Pedales"]];

// ------------------------------------------------------------------ Estado
let catalog = [];          // piezas del servidor
let board = [];            // [{ uid, gear, settings }] en orden de la cadena
let nextUid = 1;           // id único por instancia (se puede repetir una pieza)
let dragPayload = null;    // lo que se arrastra (dataTransfer no se lee en dragover)

// ------------------------------------------------------------ Referencias DOM
const gearList = document.getElementById("gear-list");
const dropzone = document.getElementById("dropzone");
const boardCount = document.getElementById("board-count");
const nameInput = document.getElementById("preset-name");
const descInput = document.getElementById("preset-description");
const saveBtn = document.getElementById("save-btn");
const clearBtn = document.getElementById("clear-btn");
const alertBox = document.getElementById("builder-alert");
const modalEl = document.getElementById("knobModal");
const modalTitle = document.getElementById("knobModalTitle");
const modalBody = document.getElementById("knobModalBody");
const resetBtn = document.getElementById("knob-reset");
const knobModal = new bootstrap.Modal(modalEl);
let selectedUid = null;    // pieza abierta en el modal

// Utilidades
function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;     // textContent: evita inyección de HTML
    return node;
}

const knobsFor = (gear) => KNOBS_BY_NAME[gear.name] || KNOBS_BY_TYPE[gear.type] || KNOBS_BY_TYPE.pedal;

function defaultSettings(gear) {
    const settings = {};
    knobsFor(gear).forEach((knob) => { settings[knob] = 5; });
    return settings;
}

// Color estable por nombre para dar identidad visual a cada pedal
function hueFromName(name) {
    let hue = 0;
    for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    return hue;
}

// Valor 1..10 -> ángulo -135º..+135º
const knobAngle = (value) => -135 + ((value - 1) / 9) * 270;

function showAlert(message, kind = "danger") {
    alertBox.className = `alert alert-${kind}`;
    alertBox.textContent = message;
}
function hideAlert() { alertBox.className = "alert d-none"; }

const findItem = (uid) => board.find((item) => item.uid === uid);

// Catálogo
async function loadCatalog() {
    try {
        const response = await fetch("/api/gear");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        catalog = await response.json();
        renderCatalog();
    } catch (error) {
        console.error("Error cargando el catálogo:", error);
        gearList.replaceChildren(el("p", "text-danger small", "No se pudo cargar el catálogo. Recarga la página."));
    }
}

function renderCatalog() {
    gearList.replaceChildren();
    TYPE_LABELS.forEach(([type, label]) => {
        const items = catalog.filter((gear) => gear.type === type);
        if (!items.length) return;
        gearList.append(el("div", "gear-group-title", label));
        items.forEach((gear) => gearList.append(createGearCard(gear)));
    });
}

function createGearCard(gear) {
    const card = el("div", "gear-card");
    card.draggable = true;

    const swatch = el("span", "gear-swatch");
    swatch.style.setProperty("--hue", hueFromName(gear.name));

    const info = el("div", "gear-info");
    info.append(el("div", "gear-name", gear.name), el("div", "gear-desc", gear.description || ""));

    // Botón alternativo para pantallas táctiles (el drag & drop HTML5 no funciona bien ahí)
    const addBtn = el("button", "btn btn-sm btn-outline-light", "+");
    addBtn.type = "button";
    addBtn.setAttribute("aria-label", `Añadir ${gear.name}`);
    addBtn.addEventListener("click", () => addToBoard(gear.id));

    card.append(swatch, info, addBtn);

    card.addEventListener("dragstart", (event) => {
        dragPayload = { source: "catalog", gearId: gear.id };
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", String(gear.id));   // requerido por Firefox
    });
    card.addEventListener("dragend", () => {
        dragPayload = null;
        dropzone.classList.remove("drag-over");
    });
    return card;
}

// Lógica del board
function addToBoard(gearId, index = board.length) {
    if (board.length >= MAX_ITEMS) {
        showAlert(`Máximo ${MAX_ITEMS} piezas por pedalera.`, "warning");
        return;
    }
    const gear = catalog.find((g) => g.id === gearId);
    if (!gear) return;
    hideAlert();
    board.splice(index, 0, { uid: nextUid++, gear, settings: defaultSettings(gear) });
    renderBoard();
}

function moveOnBoard(uid, index) {
    const from = board.findIndex((item) => item.uid === uid);
    if (from === -1) return;
    const [item] = board.splice(from, 1);
    if (from < index) index--;           // al quitarla, los índices posteriores bajan 1
    board.splice(index, 0, item);
    renderBoard();
}

function removeFromBoard(uid) {
    board = board.filter((item) => item.uid !== uid);
    renderBoard();
}

// Calcula en qué hueco de la cadena se suelta según la posición del cursor
function getDropIndex(x, y) {
    const cards = [...dropzone.querySelectorAll(".board-item")];
    for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (y < rect.bottom && x < rect.left + rect.width / 2) return i;
    }
    return cards.length;
}

function renderBoard() {
    boardCount.textContent = board.length;
    if (!board.length) {
        dropzone.replaceChildren(el("div", "dropzone-hint", "Arrastra aquí amplificadores y pedales para montar tu cadena"));
        return;
    }
    dropzone.replaceChildren(...board.map((item, index) => createBoardItem(item, index)));
}

function createBoardItem(item, index) {
    const wrapper = el("div", "board-item");
    wrapper.draggable = true;
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", `${item.gear.name}, posición ${index + 1}. Pulsa para ajustar.`);

    const order = el("span", "badge rounded-pill text-bg-dark order", String(index + 1));

    const remove = el("button", "btn-close btn-close-white remove-btn");
    remove.type = "button";
    remove.setAttribute("aria-label", `Quitar ${item.gear.name}`);
    remove.addEventListener("click", (event) => {
        event.stopPropagation();           // no abrir el modal
        removeFromBoard(item.uid);
    });

    wrapper.append(order, remove, buildPedalVisual(item));

    wrapper.addEventListener("click", () => openKnobModal(item.uid));
    wrapper.addEventListener("keydown", (event) => {
        if (event.target !== wrapper) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openKnobModal(item.uid);
        }
    });

    // Reordenar arrastrando dentro de la pedalera
    wrapper.addEventListener("dragstart", (event) => {
        dragPayload = { source: "chain", uid: item.uid };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(item.uid));
        wrapper.classList.add("dragging");
    });
    wrapper.addEventListener("dragend", () => {
        wrapper.classList.remove("dragging");
        dragPayload = null;
        dropzone.classList.remove("drag-over");
    });
    return wrapper;
}

function buildPedalVisual(item) {
    const isAmp = item.gear.type === "amp";
    const pedal = el("div", isAmp ? "pedal amp" : "pedal");
    pedal.style.setProperty("--hue", hueFromName(item.gear.name));

    const knobRow = el("div", "knob-row");
    knobsFor(item.gear).forEach((name) => {
        const value = item.settings[name] ?? 5;
        const wrap = el("div", "knob-wrap");
        const knob = el("div", "knob");
        knob.style.setProperty("--angle", `${knobAngle(value)}deg`);
        knob.title = `${name}: ${value}`;
        wrap.append(knob, el("span", "", `${name} ${value}`));
        knobRow.append(wrap);
    });

    pedal.append(el("div", "led"), knobRow, el("div", "pedal-name", item.gear.name));
    if (!isAmp) pedal.append(el("div", "footswitch"));
    return pedal;
}

// Drag & drop (zona)
dropzone.addEventListener("dragover", (event) => {
    if (!dragPayload) return;
    event.preventDefault();                                   // permite soltar
    event.dataTransfer.dropEffect = dragPayload.source === "catalog" ? "copy" : "move";
    dropzone.classList.add("drag-over");
});
dropzone.addEventListener("dragleave", (event) => {
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("drag-over");
});
dropzone.addEventListener("drop", (event) => {
    if (!dragPayload) return;
    event.preventDefault();
    dropzone.classList.remove("drag-over");

    const index = getDropIndex(event.clientX, event.clientY);
    if (dragPayload.source === "catalog") addToBoard(dragPayload.gearId, index);
    else moveOnBoard(dragPayload.uid, index);
    dragPayload = null;
});

// Modal de perillas
function openKnobModal(uid) {
    const item = findItem(uid);
    if (!item) return;
    selectedUid = uid;
    modalTitle.textContent = item.gear.name;
    buildKnobControls(item);
    knobModal.show();
}

function buildKnobControls(item) {
    modalBody.replaceChildren();
    knobsFor(item.gear).forEach((name, i) => {
        const value = item.settings[name] ?? 5;
        const row = el("div", "knob-control");

        const knob = el("div", "knob knob-lg");
        knob.style.setProperty("--angle", `${knobAngle(value)}deg`);

        const label = el("label", "form-label", name);
        label.htmlFor = `knob-input-${i}`;

        const range = document.createElement("input");
        range.type = "range";
        range.className = "form-range";
        range.id = `knob-input-${i}`;
        range.min = 1;
        range.max = 10;
        range.step = 1;
        range.value = value;

        const output = el("output", "", String(value));

        range.addEventListener("input", () => {
            const newValue = Number(range.value);
            item.settings[name] = newValue;                   // actualiza el estado
            output.textContent = newValue;
            knob.style.setProperty("--angle", `${knobAngle(newValue)}deg`);
            renderBoard();                                    // refleja el cambio en la pedalera
        });

        row.append(knob, label, range, output);
        modalBody.append(row);
    });
}

resetBtn.addEventListener("click", () => {
    const item = findItem(selectedUid);
    if (!item) return;
    item.settings = defaultSettings(item.gear);
    buildKnobControls(item);
    renderBoard();
});

// Guardado
async function savePreset() {
    hideAlert();
    const name = nameInput.value.trim();
    if (!name) {
        showAlert("Ponle un nombre al preset antes de guardarlo.", "warning");
        nameInput.focus();
        return;
    }
    if (!board.length) {
        showAlert("Añade al menos una pieza a la pedalera.", "warning");
        return;
    }

    // El orden del array es el orden de la cadena
    const payload = {
        name,
        description: descInput.value.trim(),
        items: board.map((item, index) => ({
            gear_id: item.gear.id,
            position: index + 1,
            settings: item.settings,       // {"Drive": 8, "Tone": 5, ...}
        })),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando…";
    try {
        const response = await fetch("/builder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Error al guardar el preset.");
        window.location.href = data.redirect || "/";     // el dashboard mostrará el aviso (flash)
    } catch (error) {
        showAlert(error.message, "danger");
        saveBtn.disabled = false;
        saveBtn.textContent = "Guardar preset";
    }
}

saveBtn.addEventListener("click", savePreset);
clearBtn.addEventListener("click", () => {
    if (!board.length || confirm("¿Vaciar la pedalera?")) {
        board = [];
        renderBoard();
    }
});

// Precarga (?from=ID)
function loadInitialPreset() {
    const initial = window.INITIAL_PRESET;
    if (!initial) return;
    nameInput.value = initial.name || "";
    descInput.value = initial.description || "";
    initial.items.forEach((entry) => {
        const gear = catalog.find((g) => g.id === entry.gear_id);
        if (!gear) return;
        board.push({
            uid: nextUid++,
            gear,
            settings: { ...defaultSettings(gear), ...entry.settings },
        });
    });
}

// Inicio
(async function init() {
    renderBoard();            // muestra el mensaje de dropzone vacía
    await loadCatalog();      // fetch a /api/gear
    loadInitialPreset();
    renderBoard();
})();
