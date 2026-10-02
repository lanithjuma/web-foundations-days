
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" }
];

// 1. Search notes without case sensitivity
function searchNotes(word) {
  return notes.filter(note =>
    note.text.toLowerCase().includes(word.toLowerCase())
  );
}

// 2. Return the longest note, or null if notes is empty
function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];

  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }

  return longest;
}

// 3. Count notes by category
function countByCategory() {
  let counts = {
    personal: 0,
    work: 0,
    study: 0
  };

  for (let note of notes) {
    if (note.category in counts) {
      counts[note.category]++;
    }
  }

  return counts;
}

// 4. Create a summary sentence
function getSummary() {
  let counts = countByCategory();
  let total = notes.length;
  let word = total === 1 ? "note" : "notes";

  return `${total} ${word}: ${counts.personal} personal, ${counts.work} work, ${counts.study} study.`;
}

// 5. Check for duplicate text, ignoring case and extra spaces
function isDuplicate(text) {
  let normalizedText = text.trim().toLowerCase();

  return notes.some(note =>
    note.text.trim().toLowerCase() === normalizedText
  );
}

// 6. Add a note after validating the input
function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Note text must be a string.");
    return false;
  }

  let cleanedText = text.trim();

  if (cleanedText.length < 1 || cleanedText.length > 200) {
    console.log("Note must contain 1–200 characters.");
    return false;
  }

  if (isDuplicate(cleanedText)) {
    console.log("A note with this text already exists.");
    return false;
  }

  let validCategories = ["personal", "work", "study"];

  if (!validCategories.includes(category)) {
    console.log("Invalid category. Use personal, work, or study.");
    return false;
  }

  let nextId = notes.length === 0
    ? 1
    : Math.max(...notes.map(note => note.id)) + 1;

  notes.push({
    id: nextId,
    text: cleanedText,
    category: category
  });

  console.log("Note added successfully.");
  return true;
}


// ================================
// TESTS: DAY 3 ASSIGNMENT
// ================================

// 1. searchNotes()
// Normal: returns notes containing "javascript" (1 match).
console.log("Search:", searchNotes("javascript"));
// Expected: [{ id: 4, text: "Revise JavaScript arrays", category: "study" }]

// Edge: no matching notes.
console.log("Empty search:", searchNotes("pizza"));
// Expected: []


// 2. longestNote()
// Normal: returns the note with the most characters.
console.log("Longest note:", longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

// Edge: returns null when the array is empty.
let savedNotes = notes;
notes = [];
console.log("Longest in empty list:", longestNote());
// Expected: null
notes = savedNotes;


// 3. countByCategory()
// Normal: counts each category in the starting data.
console.log("Category counts:", countByCategory());
// Expected: { personal: 2, work: 1, study: 2 }

// Edge: all category counts are zero for an empty list.
savedNotes = notes;
notes = [];
console.log("Empty category counts:", countByCategory());
// Expected: { personal: 0, work: 0, study: 0 }
notes = savedNotes;


// 4. getSummary()
// Normal: returns the summary of five starting notes.
console.log("Summary:", getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."

// Edge: uses singular "note" when exactly one note exists.
savedNotes = notes;
notes = [{ id: 1, text: "Read", category: "study" }];
console.log("One-note summary:", getSummary());
// Expected: "1 note: 0 personal, 0 work, 1 study."
notes = savedNotes;


// 5. isDuplicate()
// Normal: finds existing text despite different capitalization.
console.log("Duplicate check:", isDuplicate("BUY MILK AND BREAD"));
// Expected: true

// Edge: trims spaces and returns false for new text.
console.log("New text check:", isDuplicate("   Learn Python   "));
// Expected: false


// 6. addNote()
// Normal: successfully adds a valid new note.
console.log("Add valid note:", addNote("Learn Python", "study"));
// Expected logs: "Note added successfully."
//                true

// Edge 1: rejects a duplicate despite case and extra spaces.
console.log("Add duplicate:", addNote("  learn python  ", "study"));
// Expected logs: "A note with this text already exists."
//                false

// Edge 2: rejects empty text.
console.log("Add empty note:", addNote("   ", "personal"));
// Expected logs: "Note must contain 1–200 characters."
//                false

// Edge 3: rejects text longer than 200 characters.
console.log("Add long note:", addNote("A".repeat(201), "work"));
// Expected logs: "Note must contain 1–200 characters."
//                false

// Edge 4: rejects an invalid category.
console.log("Add invalid category:", addNote("Attend meeting", "social"));
// Expected logs: "Invalid category. Use personal, work, or study."
//                false

// Final state after the successful addition.
console.log("Final notes:", notes.length);
// Expected: 6

console.log("Final summary:", getSummary());
// Expected: "6 notes: 2 personal, 1 work, 3 study."