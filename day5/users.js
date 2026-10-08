const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const status = document.getElementById("status");
const usersList = document.getElementById("users-list");

let users = [];

async function loadUsers() {
  loadButton.disabled = true;
  status.textContent = "Loading users...";

  try {
    const response = await fetch(
      "https://jsonplaceholder.typicode.com/users"
    );

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    users = await response.json();

    renderUsers(users);
    status.textContent = `${users.length} users loaded successfully.`;
  } catch (error) {
    console.error(error);
    status.textContent = "Error loading users. Please try again.";
  } finally {
    loadButton.disabled = false;
  }
}

function renderUsers(list) {
  usersList.innerHTML = "";

  if (list.length === 0) {
    status.textContent = "No users match your filter.";
    return;
  }

  list.forEach((user) => {
    const listItem = document.createElement("li");

    const name = document.createElement("h2");
    name.textContent = user.name;

    const email = document.createElement("p");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("p");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("p");
    company.textContent = `Company: ${user.company.name}`;

    listItem.appendChild(name);
    listItem.appendChild(email);
    listItem.appendChild(city);
    listItem.appendChild(company);

    usersList.appendChild(listItem);
  });
}

loadButton.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
  const searchText = filterInput.value.toLowerCase();

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchText)
  );

  renderUsers(filteredUsers);
});