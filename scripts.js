const map = L.map("map", { zoomControl: false }).setView([37.9838, 23.7275], 11);

let mapResizeFrame = 0;
function refreshMapSize() {
    if (mapResizeFrame) {
        cancelAnimationFrame(mapResizeFrame);
    }

    mapResizeFrame = requestAnimationFrame(() => {
        mapResizeFrame = 0;
        map.invalidateSize({ pan: false, debounceMoveend: true });
    });
}

if ("ResizeObserver" in window) {
    new ResizeObserver(refreshMapSize).observe(document.getElementById("map"));
}
window.addEventListener("resize", refreshMapSize);
window.addEventListener("orientationchange", () => window.setTimeout(refreshMapSize, 150));
window.visualViewport?.addEventListener("resize", refreshMapSize);
window.addEventListener("load", refreshMapSize, { once: true });

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

const municipalitySearch = document.getElementById("municipality-search");
const municipalityDropdown = document.getElementById("municipality-options");
const municipalityDropdownToggle = document.getElementById("municipalityDropdownToggle");
const yearFilter = document.getElementById("year-filter");
const mapLegend = document.getElementById("map-legend");
const incidentLayer = L.layerGroup().addTo(map);

const yearPalette = ["#ff4fa3", "#37e8ff", "#ffd166", "#a78bfa", "#7ee081", "#ff8a5b", "#5c9dff"];
const unknownYearColor = "#b8c0d9";
let incidents = [];
let municipalities = [];
let yearColors = new Map();
let dropdownOpen = false;
let selectedMunicipality = "";

function normalizeLocation(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();
}

function municipalityFor(incident) {
    return String(incident.location_normalized || incident.location || "Unknown location").trim();
}

function yearFor(incident) {
    const value = incident.incident_year;
    if (value === null || value === undefined || String(value).trim() === "") {
        return "unknown";
    }

    const numericYear = Number(value);
    return Number.isFinite(numericYear) ? String(Math.trunc(numericYear)) : String(value).trim();
}

function yearLabel(year) {
    return year === "unknown" ? "Unknown year" : year;
}

function colorForYear(year) {
    return year === "unknown" ? unknownYearColor : yearColors.get(year) || yearPalette[0];
}

function popupFor(incident) {
    const content = document.createElement("div");
    const title = document.createElement("p");
    title.className = "popup-title";
    title.textContent = municipalityFor(incident);

    const item = document.createElement("div");
    item.className = "popup-incident";

    const incidentTitle = document.createElement("p");
    incidentTitle.className = "popup-count";
    incidentTitle.textContent = `Incident #${incident.incident_id}`;
    item.append(incidentTitle);

    const date = document.createElement("p");
    date.className = "popup-date";
    date.textContent = incident.incident_date || yearLabel(yearFor(incident));
    item.append(date);

    const summary = document.createElement("p");
    summary.className = "popup-summary";
    summary.textContent = incident.incident_summary || "No description provided";
    item.append(summary);

    if (incident.address) {
        const address = document.createElement("p");
        address.className = "popup-address";
        address.textContent = incident.address;
        item.append(address);
    }

    content.append(title, item);
    return content;
}

function markerFor(incident) {
    const marker = L.circleMarker([incident.latitude, incident.longitude], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: colorForYear(yearFor(incident)),
        fillOpacity: 0.96
    }).bindPopup(popupFor(incident));
    incident.marker = marker;
    return marker;
}

function selectedIncidents() {
    const selectedYear = yearFilter.value;
    return incidents.filter(incident =>
        (!selectedMunicipality || municipalityFor(incident) === selectedMunicipality) &&
        (selectedYear === "all" || yearFor(incident) === selectedYear)
    );
}

function updateMap(fitBounds = false) {
    const filteredIncidents = selectedIncidents();
    incidentLayer.clearLayers();
    filteredIncidents.forEach(incident => incidentLayer.addLayer(incident.marker));

    if (fitBounds && filteredIncidents.length > 0) {
        const bounds = L.latLngBounds(filteredIncidents.map(incident => incident.marker.getLatLng()));
        map.flyToBounds(bounds, { padding: [42, 42], maxZoom: selectedMunicipality ? 15 : 12, duration: 0.6 });
    }

    updateMunicipalityOptions();
}

function setDropdownOpen(isOpen) {
    dropdownOpen = isOpen;
    municipalityDropdown.hidden = !isOpen;
    municipalitySearch.setAttribute("aria-expanded", String(isOpen));
    municipalityDropdownToggle.setAttribute("aria-expanded", String(isOpen));
}

function chooseMunicipality(name) {
    selectedMunicipality = name;
    municipalitySearch.value = name;
    setDropdownOpen(false);
    updateMap(true);
}

function updateMunicipalityOptions() {
    const query = normalizeLocation(municipalitySearch.value);
    const selectedYear = yearFilter.value;
    const availableMunicipalities = municipalities
        .filter(municipality => normalizeLocation(municipality.name).includes(query))
        .map(municipality => ({
            ...municipality,
            count: municipality.incidents.filter(incident =>
                selectedYear === "all" || yearFor(incident) === selectedYear
            ).length
        }));

    municipalityDropdown.replaceChildren();
    if (!query) {
        const allOption = document.createElement("button");
        allOption.className = "municipality-option";
        allOption.type = "button";
        allOption.setAttribute("role", "option");
        allOption.setAttribute("aria-selected", String(!selectedMunicipality));
        allOption.textContent = "All municipalities";
        allOption.addEventListener("click", () => chooseMunicipality(""));
        municipalityDropdown.append(allOption);
    }

    if (availableMunicipalities.length === 0) {
        const empty = document.createElement("div");
        empty.className = "municipality-option-empty";
        empty.textContent = "No municipalities found.";
        municipalityDropdown.append(empty);
    } else {
        availableMunicipalities.forEach(municipality => {
            const option = document.createElement("button");
            option.className = "municipality-option";
            option.type = "button";
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", String(municipality.name === selectedMunicipality));

            const name = document.createElement("span");
            name.textContent = municipality.name;
            const count = document.createElement("span");
            count.className = "municipality-option-count";
            count.textContent = String(municipality.count);
            option.append(name, count);
            option.addEventListener("click", () => chooseMunicipality(municipality.name));
            municipalityDropdown.append(option);
        });
    }
}

function initializeYearControls() {
    const years = [...new Set(incidents.map(yearFor))]
        .sort((a, b) => a === "unknown" ? 1 : b === "unknown" ? -1 : Number(a) - Number(b));
    yearColors = new Map(
        years.filter(year => year !== "unknown").map((year, index) => [
            year,
            yearPalette[index % yearPalette.length]
        ])
    );

    years.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = yearLabel(year);
        yearFilter.append(option);
    });

    mapLegend.replaceChildren();
    years.forEach(year => {
        const entry = document.createElement("span");
        entry.className = "legend-entry";
        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.backgroundColor = colorForYear(year);
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = yearLabel(year);
        entry.append(swatch, label);
        mapLegend.append(entry);
    });
}

async function loadIncidents() {
    const response = await fetch("incidents.json");
    if (!response.ok) {
        throw new Error(`Could not load incidents.json (${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
        throw new Error("incidents.json must contain a list of incidents");
    }

    incidents = data.filter(incident =>
        incident &&
        typeof incident.latitude === "number" &&
        Number.isFinite(incident.latitude) &&
        typeof incident.longitude === "number" &&
        Number.isFinite(incident.longitude)
    );
    initializeYearControls();

    const municipalityGroups = new Map();
    incidents.forEach(incident => {
        const name = municipalityFor(incident);
        if (!municipalityGroups.has(name)) {
            municipalityGroups.set(name, []);
        }
        municipalityGroups.get(name).push(incident);
    });
    municipalities = [...municipalityGroups.entries()]
        .map(([name, municipalityIncidents]) => ({ name, incidents: municipalityIncidents }))
        .sort((a, b) => a.name.localeCompare(b.name));

    incidents.forEach(incident => {
        incident.marker = markerFor(incident);
    });
    updateMunicipalityOptions();
    updateMap();

    if (incidents.length > 0) {
        map.invalidateSize({ pan: false });
        map.fitBounds(L.latLngBounds(incidents.map(incident => incident.marker.getLatLng())), {
            padding: [42, 42],
            maxZoom: 12
        });
    }

    municipalitySearch.addEventListener("focus", () => {
        if (selectedMunicipality) {
            municipalitySearch.select();
        }
        updateMunicipalityOptions();
        setDropdownOpen(true);
    });
    municipalitySearch.addEventListener("input", () => {
        selectedMunicipality = "";
        updateMunicipalityOptions();
        setDropdownOpen(true);
        updateMap(true);
    });
    municipalitySearch.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            setDropdownOpen(false);
            municipalitySearch.blur();
        }
    });
    municipalityDropdownToggle.addEventListener("click", () => {
        if (dropdownOpen) {
            setDropdownOpen(false);
        } else {
            if (selectedMunicipality) {
                selectedMunicipality = "";
                municipalitySearch.value = "";
                updateMap();
            }
            municipalitySearch.focus();
            updateMunicipalityOptions();
            setDropdownOpen(true);
        }
    });
    document.addEventListener("click", event => {
        if (!event.target.closest(".municipality-picker")) {
            setDropdownOpen(false);
        }
    });
    yearFilter.addEventListener("change", () => updateMap(true));
}

loadIncidents().catch(error => {
    console.error(error);
});
