// Get UI elements for search
const searchInput = document.getElementById("searchInput");

// --- Autocomplete Variables ---
const suggestionsContainer = document.getElementById(
  "autocomplete-suggestions"
);
let activeSuggestionIndex = -1; // For keyboard navigation

// --- Autocomplete Functionality ---

// Function to show suggestions
function showSuggestions(matches) {
  suggestionsContainer.innerHTML = ""; // Clear previous suggestions
  if (matches.length === 0) {
    suggestionsContainer.style.display = "none";
    return;
  }

  matches.forEach((match, index) => {
    const item = document.createElement("div");
    item.classList.add("suggestion-item");
    // Display both name and ID for clarity
    item.textContent = `${match.sat.OBJECT_NAME} (${match.sat.NORAD_CAT_ID})`;
    item.dataset.index = match.index; // Store original index

    item.addEventListener("click", () => {
      searchInput.value = match.sat.OBJECT_NAME; // Or NORAD ID if preferred
      suggestionsContainer.style.display = "none";
      searchSatellite(); // Trigger search immediately
    });
    suggestionsContainer.appendChild(item);
  });

  suggestionsContainer.style.display = "block";
  activeSuggestionIndex = -1; // Reset keyboard selection
}

// Function to hide suggestions
function hideSuggestions() {
  // Use a slight delay to allow click events on suggestions to register
  setTimeout(() => {
    suggestionsContainer.style.display = "none";
    activeSuggestionIndex = -1;
  }, 100);
}

// Add input listener to search box
searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim().toLowerCase();

  if (query.length < 2 || !tleData || tleData.length === 0) {
    hideSuggestions();
    return;
  }

  const matches = tleData
    .map((sat, index) => ({ sat, index })) // Keep original index
    .filter(({ sat }) => {
      const nameMatch =
        sat.OBJECT_NAME && sat.OBJECT_NAME.toLowerCase().includes(query);
      const noradIdMatch =
        sat.NORAD_CAT_ID && String(sat.NORAD_CAT_ID).includes(query);
      return nameMatch || noradIdMatch;
    });

  showSuggestions(matches);
});

// Add keyboard navigation listener
searchInput.addEventListener("keydown", (e) => {
  const items = suggestionsContainer.querySelectorAll(".suggestion-item");
  if (suggestionsContainer.style.display !== "block" || items.length === 0) {
    // If suggestions not visible or empty, handle Enter for normal search
    if (e.key === "Enter") {
      searchSatellite();
      hideSuggestions(); // Hide in case it was briefly visible
    }
    return; // No suggestions to navigate
  }

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault(); // Prevent cursor move
      if (activeSuggestionIndex < items.length - 1) {
        activeSuggestionIndex++;
        updateActiveSuggestion(items);
      }
      break;
    case "ArrowUp":
      e.preventDefault(); // Prevent cursor move
      if (activeSuggestionIndex > 0) {
        activeSuggestionIndex--;
        updateActiveSuggestion(items);
      } else if (activeSuggestionIndex === 0) {
        // Optional: Allow moving back to input (clear selection)
        activeSuggestionIndex = -1;
        updateActiveSuggestion(items);
      }
      break;
    case "Enter":
      e.preventDefault(); // Prevent form submission (if any)
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
        items[activeSuggestionIndex].click(); // Simulate click on active suggestion
      } else {
        searchSatellite(); // Perform normal search if no suggestion selected
      }
      hideSuggestions();
      break;
    case "Escape":
      hideSuggestions();
      break;
  }
});

// Helper function to update the visual state of active suggestion
function updateActiveSuggestion(items) {
  items.forEach((item, index) => {
    if (index === activeSuggestionIndex) {
      item.classList.add("active");
      // Optional: scroll into view if list is long
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("active");
    }
  });
}

// --- Search Functionality ---
export function searchSatellite(tleData) {
  // Ensure suggestions are hidden when search is explicitly triggered
  hideSuggestions();

  if (!tleData || tleData.length === 0) {
    console.warn("Satellite data not yet loaded for search.");
    return;
  }

  const searchTerm = searchInput.value.trim().toLowerCase();
  if (!searchTerm) return; // Do nothing if search is empty

  // Find the first match (consider if multiple results should be handled differently)
  const foundIndex = tleData.findIndex((sat) => {
    const nameMatch = sat.OBJECT_NAME && sat.OBJECT_NAME.toLowerCase().includes(searchTerm);
    const noradIdMatch = sat.NORAD_CAT_ID && String(sat.NORAD_CAT_ID).includes(searchTerm);
    return nameMatch || noradIdMatch;
  });

  return foundIndex;
}

// Search-related event listeners
document.addEventListener("click", (event) => {
  if (
    !searchInput.contains(event.target) &&
    !suggestionsContainer.contains(event.target)
  ) {
    hideSuggestions();
  }
});

