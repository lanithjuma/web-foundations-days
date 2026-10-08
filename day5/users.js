const USERS_URL = "https://jsonplaceholder.typicode.com/users";
 
const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const list = document.querySelector("#users-list");
 
let users = []; // filled once by loadUsers()
 
function renderUsers(usersToShow) {
  list.innerHTML = "";
 
  if (usersToShow.length === 0) {
    const li = document.createElement("li");
    li.textContent = users.length
      ? "No users match your filter."
      : "No users loaded yet.";
    list.appendChild(li);
    return;
  }
 
  usersToShow.forEach((user) => {
    const li = document.createElement("li");
 
    const name = document.createElement("strong");
    name.textContent = user.name;
 
    const details = document.createElement("p");
    details.textContent =
      `${user.email} · ${user.address.city} · ${user.company.name}`;
 
    li.append(name, details);
    list.appendChild(li);
  });
}
 
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
 
  try {
    const response = await fetch(USERS_URL);
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    users = await response.json();
    renderUsers(users);
    statusText.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    console.error(error);
    statusText.textContent = "Could not load users. Please try again.";
  } finally {
    loadBtn.disabled = false;
  }
}
 
function applyFilter() {
  const text = filterInput.value.trim().toLowerCase();
  const matches = users.filter((user) =>
    user.name.toLowerCase().includes(text)
  );
  renderUsers(matches);
}
 
loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", applyFilter);