const map = L.map("map", { zoomControl: false }).setView([37.9838, 23.7275], 11);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

const incidentList = document.getElementById("incident-list");
const incidentCount = document.getElementById("incident-count");
const resultCount = document.getElementById("result-count");
const searchInput = document.getElementById("incident-search");
const mapStatus = document.getElementById("map-status");
const expandedMunicipalities = new Set();
const workspace = document.querySelector(".workspace");
const municipalityToggle = document.getElementById("municipalityToggle");
const municipalityPanel = document.getElementById("municipalityPanel");
const toggleArrow = document.getElementById("toggleArrow");

function normalizeLocation(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();
}

function municipalityFor(incident) {
    const location = String(incident.location_normalized || "").trim();
    if (!location) {
        return {
            key: "unknown-location",
            name: "Unknown location"
        };
    }

    return {
        key: location,
        name: location
    };
}

function groupIncidents(incidents) {
    const groups = new Map();

    incidents.forEach(incident => {
        const municipality = municipalityFor(incident);
        let group = groups.get(municipality.key);
        if (!group) {
            group = {
                key: municipality.key,
                name: municipality.name,
                incidents: [],
                points: [],
                latestDate: ""
            };
            groups.set(municipality.key, group);
        }

        group.incidents.push(incident);
        group.points.push([incident.latitude, incident.longitude]);
        if ((incident.incident_date || "") > group.latestDate) {
            group.latestDate = incident.incident_date || "";
        }
    });

    return [...groups.values()]
        .map(group => {
            group.incidents.sort((a, b) =>
                (b.incident_date || "").localeCompare(a.incident_date || "")
            );
            group.center = L.latLngBounds(group.points).getCenter();
            group.bounds = L.latLngBounds(group.points);
            return group;
        })
        .sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name));
}

function popupFor(incident, municipalityName) {
    const content = document.createElement("div");
    const title = document.createElement("p");
    title.className = "popup-title";
    title.textContent = municipalityName;

    const item = document.createElement("div");
    item.className = "popup-incident";

    const incidentTitle = document.createElement("p");
    incidentTitle.className = "popup-count";
    incidentTitle.textContent = `Incident #${incident.incident_id}`;
    item.append(incidentTitle);

    if (incident.incident_date) {
        const date = document.createElement("p");
        date.className = "popup-date";
        date.textContent = incident.incident_date;
        item.append(date);
    }

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

function markerFor(group) {
    group.markers = group.incidents.map(incident => {
        const icon = L.divIcon({
            className: "raw-point-marker-wrap",
            html: '<span class="raw-point-marker"></span>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        incident.marker = L.marker([incident.latitude, incident.longitude], { icon })
            .bindPopup(popupFor(incident, group.name))
            .addTo(map);
        return incident.marker;
    });
}

function fitMapToMunicipalities(groups) {
    const expanded = groups.filter(group => expandedMunicipalities.has(group.key));
    const fittedGroups = expanded.length > 0 ? expanded : groups;
    const points = fittedGroups.flatMap(group => group.points);
    if (points.length === 0) {
        return;
    }

    map.flyToBounds(L.latLngBounds(points), {
        padding: [42, 42],
        maxZoom: expanded.length === 1 ? 17 : 12,
        duration: 0.6
    });
}

function incidentItemFor(incident) {
    const item = document.createElement("button");
    item.className = "incident-item";
    item.type = "button";
    item.setAttribute(
        "aria-label",
        `Show incident ${incident.incident_id} at ${incident.location_normalized || "unknown location"}`
    );

    const date = document.createElement("span");
    date.className = "incident-item-date";
    date.textContent = incident.incident_date || "Unknown date";

    const summary = document.createElement("span");
    summary.className = "incident-item-summary";
    summary.textContent = incident.incident_summary || "No description";
    item.append(date, summary);

    if (incident.address) {
        const address = document.createElement("span");
        address.className = "incident-item-address";
        address.textContent = incident.address;
        item.append(address);
    }

    item.addEventListener("click", () => {
        map.flyTo(incident.marker.getLatLng(), 17, { duration: 0.6 });
        incident.marker.openPopup();
    });
    return item;
}

function cardFor(group, groups) {
    const wrapper = document.createElement("div");
    wrapper.className = "municipality-group";

    const header = document.createElement("button");
    header.className = "municipality-header";
    header.type = "button";
    const isExpanded = expandedMunicipalities.has(group.key);
    header.setAttribute("aria-expanded", String(isExpanded));

    const content = document.createElement("div");
    content.className = "municipality-content";
    content.id = `municipality-${groups.indexOf(group)}`;
    content.hidden = !isExpanded;
    header.setAttribute("aria-controls", content.id);

    const name = document.createElement("span");
    name.className = "municipality-name";
    name.textContent = group.name;

    const count = document.createElement("span");
    count.className = "municipality-count";
    count.textContent = `${group.incidents.length} incident${group.incidents.length === 1 ? "" : "s"}`;

    const chevron = document.createElement("span");
    chevron.className = "municipality-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    header.append(name, count, chevron);

    group.incidents.forEach(incident => content.append(incidentItemFor(incident)));

    header.addEventListener("click", () => {
        const willExpand = !expandedMunicipalities.has(group.key);
        if (willExpand) {
            expandedMunicipalities.add(group.key);
        } else {
            expandedMunicipalities.delete(group.key);
        }

        header.setAttribute("aria-expanded", String(willExpand));
        content.hidden = !willExpand;
        fitMapToMunicipalities(groups);
    });

    wrapper.append(header, content);

    return wrapper;
}

function updateList(groups) {
    const query = normalizeLocation(searchInput.value);
    const visible = groups.filter(group => {
        const searchable = [
            group.name,
            group.key,
            ...group.incidents.flatMap(incident => [
                incident.location_normalized,
                incident.address,
                incident.incident_summary,
                incident.incident_date
            ])
        ].filter(Boolean).map(normalizeLocation).join(" ");
        return searchable.includes(query);
    });

    incidentList.replaceChildren();
    if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = query
            ? "No municipality groups match your search."
            : "No geolocated incidents to show.";
        incidentList.append(empty);
    } else {
        visible.forEach(group => incidentList.append(cardFor(group, visible)));
    }

    resultCount.textContent = query
        ? `${visible.length} of ${groups.length}`
        : `${groups.length} shown`;
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

    const incidents = data.filter(incident =>
        incident &&
        typeof incident.latitude === "number" &&
        Number.isFinite(incident.latitude) &&
        typeof incident.longitude === "number" &&
        Number.isFinite(incident.longitude)
    );
    const groups = groupIncidents(incidents);

    groups.forEach(markerFor);
    incidentCount.textContent = String(incidents.length);
    incidentCount.setAttribute("aria-label", `${incidents.length} geolocated incidents`);
    const municipalityCount = groups.filter(group => group.key !== "unknown-location").length;
    mapStatus.textContent = `${municipalityCount} municipalities · ${incidents.length} incidents`;
    updateList(groups);

    if (groups.length > 0) {
        map.fitBounds(L.latLngBounds(groups.flatMap(group => group.points)), {
            padding: [42, 42],
            maxZoom: 12
        });
    } else {
        mapStatus.textContent = "No geolocated incidents";
    }

    searchInput.addEventListener("input", () => updateList(groups));
}

loadIncidents().catch(error => {
    console.error(error);
    incidentCount.textContent = "!";
    incidentCount.setAttribute("aria-label", "Incident locations could not be loaded");
    resultCount.textContent = "Unavailable";
    mapStatus.textContent = "Unable to load locations";
    incidentList.replaceChildren();
    const errorMessage = document.createElement("div");
    errorMessage.className = "empty-state";
    errorMessage.textContent = "Incident locations could not be loaded. Check that incidents.json is available.";
    incidentList.append(errorMessage);
});

municipalityToggle.addEventListener("click", () => {
    const isExpanded = municipalityToggle.getAttribute("aria-expanded") === "true";
    municipalityToggle.setAttribute("aria-expanded", String(!isExpanded));
    municipalityPanel.hidden = isExpanded;
    toggleArrow.textContent = isExpanded ? "▶" : "▼";
    workspace.classList.toggle("sidebar-collapsed", isExpanded);

    window.setTimeout(() => {
        map.invalidateSize({ pan: false });
    }, 260);
});
