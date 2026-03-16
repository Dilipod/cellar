/**
 * Generates 100+ HTML test scenarios for real CEL extraction validation.
 * Each scenario defines:
 *  - An HTML page with specific UI elements
 *  - Expected elements that CEL should extract (type, label, presence of bounds)
 *
 * Categories:
 *  1. Forms (login, registration, search, settings, checkout, multi-step)
 *  2. Navigation (menus, tabs, breadcrumbs, sidebars, pagination)
 *  3. Data display (tables, lists, cards, grids, dashboards)
 *  4. Interactive (modals, dropdowns, accordions, tooltips, date pickers)
 *  5. Complex apps (email, editor, spreadsheet, kanban, chat)
 *  6. Accessibility (ARIA roles, landmarks, live regions)
 *  7. Edge cases (empty page, single element, deeply nested, many elements)
 */

export interface ExpectedElement {
  type: string;           // "button" | "input" | "text" | "link" | "checkbox" etc.
  label?: string;         // Exact or substring match
  labelPattern?: string;  // Regex pattern for label
  hasBounds?: boolean;    // Must have screen coordinates
  hasValue?: boolean;     // Must have a value
}

export interface Scenario {
  id: string;
  name: string;
  category: string;
  html: string;
  expected: ExpectedElement[];
  minElements: number;      // Minimum total elements CEL should find
  maxElements?: number;     // Optional upper bound
}

// ─── Helper to wrap HTML body in a full page ───
function page(title: string, body: string, styles = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 20px; }
    ${styles}
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

// ═══════════════════════════════════════════════
// CATEGORY 1: FORMS (20 scenarios)
// ═══════════════════════════════════════════════

const formScenarios: Scenario[] = [
  {
    id: "form-001", name: "Simple login form", category: "forms",
    html: page("Login", `
      <h1>Login</h1>
      <form>
        <label for="user">Username</label>
        <input id="user" type="text" placeholder="Enter username">
        <label for="pass">Password</label>
        <input id="pass" type="password">
        <button type="submit">Sign In</button>
      </form>`),
    expected: [
      { type: "input", label: "Username", hasBounds: true },
      { type: "input", label: "Password", hasBounds: true },
      { type: "button", label: "Sign In", hasBounds: true },
      { type: "text", label: "Login" },
    ],
    minElements: 4,
  },
  {
    id: "form-002", name: "Registration form with validation", category: "forms",
    html: page("Register", `
      <h1>Create Account</h1>
      <form>
        <label for="fname">First Name</label><input id="fname" type="text" required>
        <label for="lname">Last Name</label><input id="lname" type="text" required>
        <label for="email">Email</label><input id="email" type="email" required>
        <label for="phone">Phone</label><input id="phone" type="tel">
        <label for="pwd">Password</label><input id="pwd" type="password" required>
        <label for="pwd2">Confirm Password</label><input id="pwd2" type="password" required>
        <label><input type="checkbox" id="terms"> I agree to the Terms</label>
        <button type="submit">Register</button>
      </form>`),
    expected: [
      { type: "input", label: "First Name", hasBounds: true },
      { type: "input", label: "Last Name", hasBounds: true },
      { type: "input", label: "Email", hasBounds: true },
      { type: "input", label: "Phone", hasBounds: true },
      { type: "input", label: "Password", hasBounds: true },
      { type: "input", label: "Confirm Password", hasBounds: true },
      { type: "checkbox", label: "Terms" },
      { type: "button", label: "Register", hasBounds: true },
    ],
    minElements: 8,
  },
  {
    id: "form-003", name: "Search form with autocomplete", category: "forms",
    html: page("Search", `
      <header><h1>Product Search</h1></header>
      <form role="search">
        <label for="q">Search products</label>
        <input id="q" type="search" placeholder="Search..." list="suggestions">
        <datalist id="suggestions">
          <option value="Laptop"><option value="Phone"><option value="Tablet">
        </datalist>
        <button type="submit">Search</button>
      </form>
      <div>
        <label for="cat">Category</label>
        <select id="cat"><option>All</option><option>Electronics</option><option>Books</option></select>
        <label for="sort">Sort by</label>
        <select id="sort"><option>Relevance</option><option>Price</option><option>Rating</option></select>
      </div>`),
    expected: [
      { type: "input", label: "Search products", hasBounds: true },
      { type: "button", label: "Search", hasBounds: true },
    ],
    minElements: 4,
  },
  {
    id: "form-004", name: "Settings form with toggles", category: "forms",
    html: page("Settings", `
      <h1>Settings</h1>
      <fieldset><legend>Notifications</legend>
        <label><input type="checkbox" checked> Email notifications</label>
        <label><input type="checkbox"> SMS notifications</label>
        <label><input type="checkbox" checked> Push notifications</label>
      </fieldset>
      <fieldset><legend>Privacy</legend>
        <label><input type="radio" name="vis" value="public" checked> Public</label>
        <label><input type="radio" name="vis" value="friends"> Friends only</label>
        <label><input type="radio" name="vis" value="private"> Private</label>
      </fieldset>
      <button>Save Settings</button>`),
    expected: [
      { type: "checkbox" },
      { type: "button", label: "Save Settings", hasBounds: true },
    ],
    minElements: 6,
  },
  {
    id: "form-005", name: "Checkout form", category: "forms",
    html: page("Checkout", `
      <h1>Checkout</h1>
      <h2>Shipping Address</h2>
      <label for="addr">Street Address</label><input id="addr" type="text">
      <label for="city">City</label><input id="city" type="text">
      <label for="state">State</label>
      <select id="state"><option>California</option><option>New York</option><option>Texas</option></select>
      <label for="zip">ZIP Code</label><input id="zip" type="text" pattern="[0-9]{5}">
      <h2>Payment</h2>
      <label for="card">Card Number</label><input id="card" type="text" inputmode="numeric">
      <label for="exp">Expiry</label><input id="exp" type="text" placeholder="MM/YY">
      <label for="cvv">CVV</label><input id="cvv" type="text" maxlength="4">
      <button>Place Order</button>
      <button type="button">Cancel</button>`),
    expected: [
      { type: "input", label: "Street Address", hasBounds: true },
      { type: "input", label: "City", hasBounds: true },
      { type: "input", label: "ZIP Code", hasBounds: true },
      { type: "input", label: "Card Number", hasBounds: true },
      { type: "button", label: "Place Order", hasBounds: true },
      { type: "button", label: "Cancel", hasBounds: true },
    ],
    minElements: 8,
  },
  {
    id: "form-006", name: "Contact form with textarea", category: "forms",
    html: page("Contact", `
      <h1>Contact Us</h1>
      <form>
        <label for="name">Your Name</label><input id="name" type="text">
        <label for="email">Email</label><input id="email" type="email">
        <label for="subject">Subject</label>
        <select id="subject"><option>General</option><option>Support</option><option>Sales</option></select>
        <label for="msg">Message</label><textarea id="msg" rows="5"></textarea>
        <label><input type="checkbox"> Send me a copy</label>
        <button type="submit">Send Message</button>
      </form>`),
    expected: [
      { type: "input", label: "Name", hasBounds: true },
      { type: "input", label: "Email", hasBounds: true },
      { type: "button", label: "Send Message", hasBounds: true },
    ],
    minElements: 5,
  },
  {
    id: "form-007", name: "File upload form", category: "forms",
    html: page("Upload", `
      <h1>Upload Document</h1>
      <form>
        <label for="title">Document Title</label><input id="title" type="text">
        <label for="file">Choose File</label><input id="file" type="file" accept=".pdf,.doc">
        <label for="desc">Description</label><textarea id="desc"></textarea>
        <button type="submit">Upload</button>
        <button type="reset">Clear</button>
      </form>`),
    expected: [
      { type: "input", label: "Document Title", hasBounds: true },
      { type: "button", label: "Upload", hasBounds: true },
      { type: "button", label: "Clear", hasBounds: true },
    ],
    minElements: 4,
  },
  {
    id: "form-008", name: "Multi-step wizard step 1", category: "forms",
    html: page("Wizard - Step 1", `
      <div role="progressbar" aria-valuenow="1" aria-valuemax="3">Step 1 of 3</div>
      <h1>Personal Information</h1>
      <label for="dob">Date of Birth</label><input id="dob" type="date">
      <label for="gender">Gender</label>
      <select id="gender"><option>Male</option><option>Female</option><option>Other</option></select>
      <label for="country">Country</label>
      <select id="country"><option>USA</option><option>UK</option><option>Canada</option></select>
      <button disabled>Previous</button>
      <button>Next</button>`),
    expected: [
      { type: "text", label: "Personal Information" },
      { type: "button", label: "Next", hasBounds: true },
    ],
    minElements: 4,
  },
  {
    id: "form-009", name: "Range sliders", category: "forms",
    html: page("Preferences", `
      <h1>Preferences</h1>
      <label for="vol">Volume</label><input id="vol" type="range" min="0" max="100" value="50">
      <label for="bright">Brightness</label><input id="bright" type="range" min="0" max="100" value="75">
      <label for="contrast">Contrast</label><input id="contrast" type="range" min="0" max="100" value="60">
      <button>Apply</button>
      <button>Reset Defaults</button>`),
    expected: [
      { type: "slider", label: "Volume" },
      { type: "slider", label: "Brightness" },
      { type: "button", label: "Apply", hasBounds: true },
    ],
    minElements: 5,
  },
  {
    id: "form-010", name: "Inline edit form", category: "forms",
    html: page("Profile", `
      <h1>Your Profile</h1>
      <div>
        <span>Display Name:</span>
        <input type="text" value="John Doe" aria-label="Display Name">
        <button>Edit</button>
      </div>
      <div>
        <span>Bio:</span>
        <textarea aria-label="Bio">Software developer</textarea>
        <button>Edit</button>
      </div>
      <div>
        <span>Website:</span>
        <input type="url" value="https://example.com" aria-label="Website">
        <button>Edit</button>
      </div>
      <button>Save All</button>`),
    expected: [
      { type: "input", label: "Display Name", hasValue: true },
      { type: "input", label: "Website", hasValue: true },
      { type: "button", label: "Save All", hasBounds: true },
    ],
    minElements: 6,
  },
  {
    id: "form-011", name: "Color and date pickers", category: "forms",
    html: page("Theme", `
      <h1>Theme Settings</h1>
      <label for="primary">Primary Color</label><input id="primary" type="color" value="#3366cc">
      <label for="bg">Background Color</label><input id="bg" type="color" value="#ffffff">
      <label for="start">Start Date</label><input id="start" type="date">
      <label for="end">End Date</label><input id="end" type="date">
      <label for="time">Reminder Time</label><input id="time" type="time">
      <button>Save Theme</button>`),
    expected: [
      { type: "button", label: "Save Theme", hasBounds: true },
    ],
    minElements: 6,
  },
  {
    id: "form-012", name: "Number inputs", category: "forms",
    html: page("Quantity", `
      <h1>Order Details</h1>
      <label for="qty">Quantity</label><input id="qty" type="number" min="1" max="99" value="1">
      <label for="price">Unit Price ($)</label><input id="price" type="number" step="0.01" value="9.99">
      <label for="discount">Discount (%)</label><input id="discount" type="number" min="0" max="100" value="0">
      <p>Total: $9.99</p>
      <button>Add to Cart</button>`),
    expected: [
      { type: "input", label: "Quantity", hasBounds: true },
      { type: "button", label: "Add to Cart", hasBounds: true },
    ],
    minElements: 4,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 2: NAVIGATION (15 scenarios)
// ═══════════════════════════════════════════════

const navScenarios: Scenario[] = [
  {
    id: "nav-001", name: "Top navigation bar", category: "navigation",
    html: page("Dashboard", `
      <nav aria-label="Main navigation">
        <a href="#home">Home</a>
        <a href="#products">Products</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
        <a href="#login">Login</a>
      </nav>
      <main><h1>Welcome to Dashboard</h1></main>`),
    expected: [
      { type: "link", label: "Home" },
      { type: "link", label: "Products" },
      { type: "link", label: "About" },
      { type: "link", label: "Contact" },
      { type: "link", label: "Login" },
    ],
    minElements: 5,
  },
  {
    id: "nav-002", name: "Tab navigation", category: "navigation",
    html: page("Tabs", `
      <div role="tablist" aria-label="Content tabs">
        <button role="tab" aria-selected="true" aria-controls="panel1">Overview</button>
        <button role="tab" aria-selected="false" aria-controls="panel2">Details</button>
        <button role="tab" aria-selected="false" aria-controls="panel3">Reviews</button>
        <button role="tab" aria-selected="false" aria-controls="panel4">FAQ</button>
      </div>
      <div role="tabpanel" id="panel1"><p>Overview content here...</p></div>`),
    expected: [
      { type: "button", label: "Overview" },
      { type: "button", label: "Details" },
      { type: "button", label: "Reviews" },
      { type: "button", label: "FAQ" },
    ],
    minElements: 4,
  },
  {
    id: "nav-003", name: "Breadcrumb navigation", category: "navigation",
    html: page("Product Detail", `
      <nav aria-label="Breadcrumb">
        <ol>
          <li><a href="#home">Home</a></li>
          <li><a href="#cat">Electronics</a></li>
          <li><a href="#sub">Laptops</a></li>
          <li aria-current="page">MacBook Pro</li>
        </ol>
      </nav>
      <h1>MacBook Pro</h1>
      <p>The ultimate pro notebook.</p>`),
    expected: [
      { type: "link", label: "Home" },
      { type: "link", label: "Electronics" },
      { type: "link", label: "Laptops" },
      { type: "text", label: "MacBook Pro" },
    ],
    minElements: 4,
  },
  {
    id: "nav-004", name: "Sidebar navigation", category: "navigation",
    html: page("Docs", `
      <div style="display:flex">
        <aside>
          <nav aria-label="Documentation">
            <h2>Documentation</h2>
            <ul>
              <li><a href="#intro">Introduction</a></li>
              <li><a href="#install">Installation</a></li>
              <li><a href="#config">Configuration</a></li>
              <li><a href="#api">API Reference</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </nav>
        </aside>
        <main><h1>Introduction</h1><p>Welcome to the documentation.</p></main>
      </div>`),
    expected: [
      { type: "link", label: "Introduction" },
      { type: "link", label: "Installation" },
      { type: "link", label: "API Reference" },
    ],
    minElements: 5,
  },
  {
    id: "nav-005", name: "Pagination controls", category: "navigation",
    html: page("Results", `
      <h1>Search Results</h1>
      <ul><li>Result 1</li><li>Result 2</li><li>Result 3</li></ul>
      <nav aria-label="Pagination">
        <button disabled>Previous</button>
        <button aria-current="page">1</button>
        <button>2</button>
        <button>3</button>
        <button>4</button>
        <button>5</button>
        <button>Next</button>
      </nav>`),
    expected: [
      { type: "button", label: "Previous" },
      { type: "button", label: "Next" },
      { type: "text", label: "Search Results" },
    ],
    minElements: 7,
  },
  {
    id: "nav-006", name: "Footer with links", category: "navigation",
    html: page("Footer", `
      <main><h1>Page Content</h1><p>Main content here.</p></main>
      <footer>
        <div>
          <h3>Company</h3>
          <a href="#about">About Us</a>
          <a href="#careers">Careers</a>
          <a href="#press">Press</a>
        </div>
        <div>
          <h3>Support</h3>
          <a href="#help">Help Center</a>
          <a href="#docs">Documentation</a>
          <a href="#status">System Status</a>
        </div>
        <div>
          <h3>Legal</h3>
          <a href="#privacy">Privacy Policy</a>
          <a href="#terms">Terms of Service</a>
        </div>
      </footer>`),
    expected: [
      { type: "link", label: "About Us" },
      { type: "link", label: "Help Center" },
      { type: "link", label: "Privacy Policy" },
    ],
    minElements: 8,
  },
  {
    id: "nav-007", name: "Dropdown menu", category: "navigation",
    html: page("Menu", `
      <nav>
        <button aria-haspopup="true" aria-expanded="true">File</button>
        <ul role="menu">
          <li role="menuitem"><button>New</button></li>
          <li role="menuitem"><button>Open</button></li>
          <li role="menuitem"><button>Save</button></li>
          <li role="separator"></li>
          <li role="menuitem"><button>Exit</button></li>
        </ul>
      </nav>`),
    expected: [
      { type: "button", label: "File" },
      { type: "button", label: "New" },
      { type: "button", label: "Open" },
      { type: "button", label: "Save" },
      { type: "button", label: "Exit" },
    ],
    minElements: 5,
  },
  {
    id: "nav-008", name: "Toolbar with icon buttons", category: "navigation",
    html: page("Editor", `
      <div role="toolbar" aria-label="Text formatting">
        <button aria-label="Bold">B</button>
        <button aria-label="Italic">I</button>
        <button aria-label="Underline">U</button>
        <button aria-label="Strikethrough">S</button>
        <span role="separator"></span>
        <button aria-label="Align Left">&#8676;</button>
        <button aria-label="Align Center">&#8596;</button>
        <button aria-label="Align Right">&#8677;</button>
      </div>
      <textarea rows="10" aria-label="Editor content"></textarea>`),
    expected: [
      { type: "button", label: "Bold" },
      { type: "button", label: "Italic" },
      { type: "button", label: "Underline" },
    ],
    minElements: 7,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 3: DATA DISPLAY (20 scenarios)
// ═══════════════════════════════════════════════

const dataScenarios: Scenario[] = [
  {
    id: "data-001", name: "Simple data table", category: "data",
    html: page("Users", `
      <h1>User List</h1>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>
          <tr><td>Alice Smith</td><td>alice@example.com</td><td>Admin</td><td><button>Edit</button><button>Delete</button></td></tr>
          <tr><td>Bob Jones</td><td>bob@example.com</td><td>User</td><td><button>Edit</button><button>Delete</button></td></tr>
          <tr><td>Carol White</td><td>carol@example.com</td><td>Editor</td><td><button>Edit</button><button>Delete</button></td></tr>
        </tbody>
      </table>`),
    expected: [
      { type: "text", label: "User List" },
      { type: "button", label: "Edit" },
      { type: "button", label: "Delete" },
    ],
    minElements: 10,
  },
  {
    id: "data-002", name: "Sortable table with headers", category: "data",
    html: page("Products", `
      <h1>Product Catalog</h1>
      <table>
        <thead>
          <tr>
            <th><button>Name &#9650;</button></th>
            <th><button>Price &#9660;</button></th>
            <th><button>Stock</button></th>
            <th><button>Category</button></th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({length: 10}, (_, i) => `
            <tr><td>Product ${i+1}</td><td>$${(i*10+9.99).toFixed(2)}</td><td>${100-i*10}</td><td>Category ${i%3+1}</td></tr>
          `).join("")}
        </tbody>
      </table>
      <nav aria-label="Table pagination">
        <button>Previous</button><span>Page 1 of 5</span><button>Next</button>
      </nav>`),
    expected: [
      { type: "text", label: "Product Catalog" },
      { type: "button", label: "Previous" },
      { type: "button", label: "Next" },
    ],
    minElements: 15,
  },
  {
    id: "data-003", name: "Card grid layout", category: "data",
    html: page("Cards", `
      <h1>Featured Items</h1>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        ${Array.from({length: 6}, (_, i) => `
          <div role="article">
            <h2>Item ${i+1}</h2>
            <p>Description for item ${i+1}</p>
            <span>$${(i*15+19.99).toFixed(2)}</span>
            <button>Add to Cart</button>
            <button>View Details</button>
          </div>
        `).join("")}
      </div>`),
    expected: [
      { type: "button", label: "Add to Cart" },
      { type: "button", label: "View Details" },
    ],
    minElements: 12,
  },
  {
    id: "data-004", name: "Definition list", category: "data",
    html: page("Details", `
      <h1>Order #12345</h1>
      <dl>
        <dt>Status</dt><dd>Processing</dd>
        <dt>Date</dt><dd>March 15, 2026</dd>
        <dt>Total</dt><dd>$149.99</dd>
        <dt>Shipping</dt><dd>Express (2-3 days)</dd>
        <dt>Payment</dt><dd>Visa ending in 4242</dd>
      </dl>
      <button>Track Order</button>
      <button>Cancel Order</button>`),
    expected: [
      { type: "text", label: "Order #12345" },
      { type: "button", label: "Track Order", hasBounds: true },
      { type: "button", label: "Cancel Order", hasBounds: true },
    ],
    minElements: 5,
  },
  {
    id: "data-005", name: "Stats dashboard", category: "data",
    html: page("Dashboard", `
      <h1>Dashboard</h1>
      <div style="display:flex;gap:16px">
        <div role="status"><h2>Revenue</h2><p>$45,231</p></div>
        <div role="status"><h2>Orders</h2><p>1,234</p></div>
        <div role="status"><h2>Users</h2><p>5,678</p></div>
        <div role="status"><h2>Conversion</h2><p>3.2%</p></div>
      </div>
      <h2>Recent Orders</h2>
      <table>
        <thead><tr><th>ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>#001</td><td>Alice</td><td>$99</td><td>Shipped</td></tr>
          <tr><td>#002</td><td>Bob</td><td>$149</td><td>Pending</td></tr>
          <tr><td>#003</td><td>Carol</td><td>$75</td><td>Delivered</td></tr>
        </tbody>
      </table>`),
    expected: [
      { type: "text", label: "Dashboard" },
      { type: "text", label: "Revenue" },
      { type: "text", label: "Orders" },
    ],
    minElements: 10,
  },
  {
    id: "data-006", name: "Nested list with checkboxes", category: "data",
    html: page("Todo", `
      <h1>Todo List</h1>
      <ul>
        <li><label><input type="checkbox" checked> Buy groceries</label>
          <ul><li><label><input type="checkbox" checked> Milk</label></li>
          <li><label><input type="checkbox"> Bread</label></li></ul></li>
        <li><label><input type="checkbox"> Call dentist</label></li>
        <li><label><input type="checkbox"> Write report</label>
          <ul><li><label><input type="checkbox"> Research</label></li>
          <li><label><input type="checkbox"> Draft</label></li>
          <li><label><input type="checkbox"> Review</label></li></ul></li>
      </ul>
      <button>Add Task</button>
      <button>Clear Completed</button>`),
    expected: [
      { type: "checkbox" },
      { type: "button", label: "Add Task" },
      { type: "button", label: "Clear Completed" },
    ],
    minElements: 8,
  },
  {
    id: "data-007", name: "Progress indicators", category: "data",
    html: page("Progress", `
      <h1>Project Status</h1>
      <div>
        <label for="p1">Frontend</label>
        <progress id="p1" value="80" max="100">80%</progress>
      </div>
      <div>
        <label for="p2">Backend</label>
        <progress id="p2" value="60" max="100">60%</progress>
      </div>
      <div>
        <label for="p3">Testing</label>
        <progress id="p3" value="30" max="100">30%</progress>
      </div>
      <div>
        <label for="p4">Documentation</label>
        <progress id="p4" value="10" max="100">10%</progress>
      </div>`),
    expected: [
      { type: "text", label: "Project Status" },
    ],
    minElements: 4,
  },
  {
    id: "data-008", name: "Large table (50 rows)", category: "data",
    html: page("Large Table", `
      <h1>Transaction Log</h1>
      <table>
        <thead><tr><th>ID</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${Array.from({length: 50}, (_, i) => `
            <tr><td>TXN-${String(i+1).padStart(4,'0')}</td><td>2026-03-${String(i%28+1).padStart(2,'0')}</td><td>$${(Math.random()*1000).toFixed(2)}</td><td>${['Completed','Pending','Failed'][i%3]}</td></tr>
          `).join("")}
        </tbody>
      </table>`),
    expected: [
      { type: "text", label: "Transaction Log" },
    ],
    minElements: 50,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 4: INTERACTIVE (15 scenarios)
// ═══════════════════════════════════════════════

const interactiveScenarios: Scenario[] = [
  {
    id: "int-001", name: "Modal dialog", category: "interactive",
    html: page("Modal", `
      <h1>Main Page</h1>
      <button id="openBtn">Open Dialog</button>
      <dialog open>
        <h2>Confirm Action</h2>
        <p>Are you sure you want to proceed?</p>
        <button>Cancel</button>
        <button>Confirm</button>
      </dialog>`),
    expected: [
      { type: "button", label: "Open Dialog" },
      { type: "text", label: "Confirm Action" },
      { type: "button", label: "Cancel" },
      { type: "button", label: "Confirm" },
    ],
    minElements: 4,
  },
  {
    id: "int-002", name: "Accordion panels", category: "interactive",
    html: page("FAQ", `
      <h1>Frequently Asked Questions</h1>
      ${["What is CEL?", "How does it work?", "Is it free?", "How do I install it?", "Where is the documentation?"].map((q, i) => `
        <details ${i === 0 ? 'open' : ''}>
          <summary>${q}</summary>
          <p>Answer to: ${q}</p>
        </details>
      `).join("")}`),
    expected: [
      { type: "text", label: "Frequently Asked Questions" },
    ],
    minElements: 5,
  },
  {
    id: "int-003", name: "Alert messages", category: "interactive",
    html: page("Alerts", `
      <div role="alert">
        <strong>Error:</strong> Your session has expired. <button>Log in again</button>
      </div>
      <div role="alert">
        <strong>Warning:</strong> Your account will be suspended. <button>Update payment</button>
      </div>
      <div role="status">
        <strong>Success:</strong> Your changes have been saved.
      </div>
      <div role="status">
        <strong>Info:</strong> A new version is available. <button>Update now</button>
      </div>`),
    expected: [
      { type: "button", label: "Log in again" },
      { type: "button", label: "Update payment" },
      { type: "button", label: "Update now" },
    ],
    minElements: 3,
  },
  {
    id: "int-004", name: "Tree view", category: "interactive",
    html: page("Files", `
      <h1>File Explorer</h1>
      <ul role="tree" aria-label="Files">
        <li role="treeitem" aria-expanded="true">
          src/
          <ul role="group">
            <li role="treeitem" aria-expanded="true">
              components/
              <ul role="group">
                <li role="treeitem">Header.tsx</li>
                <li role="treeitem">Footer.tsx</li>
                <li role="treeitem">Sidebar.tsx</li>
              </ul>
            </li>
            <li role="treeitem">index.ts</li>
            <li role="treeitem">App.tsx</li>
          </ul>
        </li>
        <li role="treeitem">package.json</li>
        <li role="treeitem">tsconfig.json</li>
      </ul>`),
    expected: [
      { type: "text", label: "File Explorer" },
    ],
    minElements: 5,
  },
  {
    id: "int-005", name: "Editable list with drag handles", category: "interactive",
    html: page("Playlist", `
      <h1>My Playlist</h1>
      <ul>
        ${["Bohemian Rhapsody", "Stairway to Heaven", "Hotel California", "Imagine", "Smells Like Teen Spirit"].map((song, i) => `
          <li>
            <button aria-label="Drag ${song}">&#9776;</button>
            <span>${song}</span>
            <button aria-label="Remove ${song}">&#10005;</button>
          </li>
        `).join("")}
      </ul>
      <button>Add Song</button>
      <button>Shuffle</button>
      <button>Clear All</button>`),
    expected: [
      { type: "button", label: "Add Song" },
      { type: "button", label: "Shuffle" },
      { type: "button", label: "Clear All" },
    ],
    minElements: 10,
  },
  {
    id: "int-006", name: "Rating stars", category: "interactive",
    html: page("Review", `
      <h1>Write a Review</h1>
      <div role="radiogroup" aria-label="Rating">
        <button role="radio" aria-checked="false" aria-label="1 star">&#9734;</button>
        <button role="radio" aria-checked="false" aria-label="2 stars">&#9734;</button>
        <button role="radio" aria-checked="false" aria-label="3 stars">&#9734;</button>
        <button role="radio" aria-checked="true" aria-label="4 stars">&#9733;</button>
        <button role="radio" aria-checked="false" aria-label="5 stars">&#9734;</button>
      </div>
      <label for="review">Your Review</label>
      <textarea id="review"></textarea>
      <button>Submit Review</button>`),
    expected: [
      // role="radio" maps to radio_button in AT-SPI2/CEL
      { type: "radio_button", label: "1 star" },
      { type: "radio_button", label: "5 stars" },
      { type: "button", label: "Submit Review" },
    ],
    minElements: 6,
  },
  {
    id: "int-007", name: "Context menu", category: "interactive",
    html: page("Context Menu", `
      <h1>Right-click Menu Example</h1>
      <div role="menu" aria-label="Context menu">
        <button role="menuitem">Cut</button>
        <button role="menuitem">Copy</button>
        <button role="menuitem">Paste</button>
        <hr role="separator">
        <button role="menuitem">Select All</button>
        <button role="menuitem">Delete</button>
      </div>`),
    expected: [
      // role="menuitem" maps to menu_item in AT-SPI2/CEL
      { type: "menu_item", label: "Cut" },
      { type: "menu_item", label: "Copy" },
      { type: "menu_item", label: "Paste" },
      { type: "menu_item", label: "Select All" },
      { type: "menu_item", label: "Delete" },
    ],
    minElements: 5,
  },
  {
    id: "int-008", name: "Stepper/counter", category: "interactive",
    html: page("Counter", `
      <h1>Quantity Selector</h1>
      <div role="group" aria-label="Quantity">
        <button aria-label="Decrease">-</button>
        <input type="number" value="1" aria-label="Quantity" min="0" max="99">
        <button aria-label="Increase">+</button>
      </div>
      <div role="group" aria-label="Size">
        <button aria-label="Decrease size">-</button>
        <input type="number" value="42" aria-label="Size" min="30" max="50">
        <button aria-label="Increase size">+</button>
      </div>`),
    expected: [
      { type: "button", label: "Decrease" },
      { type: "button", label: "Increase" },
      { type: "input", label: "Quantity" },
    ],
    minElements: 6,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 5: COMPLEX APPS (15 scenarios)
// ═══════════════════════════════════════════════

const appScenarios: Scenario[] = [
  {
    id: "app-001", name: "Email client", category: "apps",
    html: page("Email", `
      <div style="display:flex;height:80vh">
        <aside style="width:200px">
          <button>Compose</button>
          <nav aria-label="Folders">
            <a href="#inbox">Inbox (3)</a>
            <a href="#sent">Sent</a>
            <a href="#drafts">Drafts (1)</a>
            <a href="#trash">Trash</a>
          </nav>
        </aside>
        <main style="flex:1">
          <div role="toolbar">
            <button>Archive</button><button>Delete</button><button>Mark as Read</button><button>Move to</button>
          </div>
          <table aria-label="Email list">
            <tbody>
              <tr><td><input type="checkbox"></td><td>Alice</td><td>Meeting tomorrow</td><td>10:30 AM</td></tr>
              <tr><td><input type="checkbox"></td><td>Bob</td><td>Project update</td><td>9:15 AM</td></tr>
              <tr><td><input type="checkbox"></td><td>Carol</td><td>Quarterly review</td><td>Yesterday</td></tr>
            </tbody>
          </table>
        </main>
      </div>`, "aside { border-right: 1px solid #ccc; padding: 16px; } main { padding: 16px; }"),
    expected: [
      { type: "button", label: "Compose" },
      { type: "link", label: "Inbox" },
      { type: "link", label: "Sent" },
      { type: "button", label: "Archive" },
      { type: "button", label: "Delete" },
      { type: "checkbox" },
    ],
    minElements: 10,
  },
  {
    id: "app-002", name: "Code editor", category: "apps",
    html: page("Editor", `
      <div style="display:flex;height:80vh">
        <aside style="width:200px">
          <h2>Explorer</h2>
          <ul role="tree">
            <li role="treeitem">index.ts</li>
            <li role="treeitem">app.ts</li>
            <li role="treeitem">utils.ts</li>
            <li role="treeitem">config.json</li>
          </ul>
        </aside>
        <main style="flex:1">
          <div role="tablist">
            <button role="tab" aria-selected="true">index.ts</button>
            <button role="tab">app.ts</button>
          </div>
          <textarea aria-label="Code editor" rows="20" style="width:100%;font-family:monospace">
function main() {
  console.log("Hello");
}
          </textarea>
          <div role="toolbar" aria-label="Editor actions">
            <button>Run</button><button>Debug</button><button>Format</button>
          </div>
        </main>
      </div>`),
    expected: [
      { type: "button", label: "Run" },
      { type: "button", label: "Debug" },
      { type: "button", label: "Format" },
    ],
    minElements: 8,
  },
  {
    id: "app-003", name: "Chat application", category: "apps",
    html: page("Chat", `
      <div style="display:flex;height:80vh">
        <aside style="width:200px">
          <h2>Contacts</h2>
          <ul>
            <li><button>Alice (online)</button></li>
            <li><button>Bob (away)</button></li>
            <li><button>Carol (offline)</button></li>
          </ul>
        </aside>
        <main style="flex:1;display:flex;flex-direction:column">
          <h2>Chat with Alice</h2>
          <div role="log" aria-label="Messages" style="flex:1;overflow:auto">
            <div>Alice: Hey, how are you?</div>
            <div>You: I'm good, thanks!</div>
            <div>Alice: Great, let's catch up.</div>
          </div>
          <form style="display:flex">
            <input type="text" aria-label="Type a message" placeholder="Type a message..." style="flex:1">
            <button>Send</button>
            <button aria-label="Attach file">📎</button>
            <button aria-label="Emoji">😊</button>
          </form>
        </main>
      </div>`),
    expected: [
      { type: "button", label: "Alice" },
      { type: "input", label: "Type a message" },
      { type: "button", label: "Send" },
    ],
    minElements: 6,
  },
  {
    id: "app-004", name: "Kanban board", category: "apps",
    html: page("Kanban", `
      <h1>Project Board</h1>
      <div style="display:flex;gap:16px">
        ${["To Do", "In Progress", "Review", "Done"].map(col => `
          <div style="width:250px;border:1px solid #ccc;padding:8px">
            <h2>${col}</h2>
            ${Array.from({length: 3}, (_, i) => `
              <div role="article" style="border:1px solid #eee;padding:8px;margin:4px 0">
                <h3>Task ${col[0]}${i+1}</h3>
                <p>Description for task</p>
                <button>Edit</button>
                <button>Move</button>
              </div>
            `).join("")}
            <button>Add Card</button>
          </div>
        `).join("")}
      </div>`),
    expected: [
      { type: "text", label: "To Do" },
      { type: "text", label: "In Progress" },
      { type: "text", label: "Done" },
      { type: "button", label: "Add Card" },
      { type: "button", label: "Edit" },
    ],
    minElements: 20,
  },
  {
    id: "app-005", name: "Calendar view", category: "apps",
    html: page("Calendar", `
      <h1>March 2026</h1>
      <div role="toolbar">
        <button>Previous Month</button>
        <button>Today</button>
        <button>Next Month</button>
      </div>
      <table role="grid" aria-label="Calendar">
        <thead><tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr></thead>
        <tbody>
          ${Array.from({length: 5}, (_, week) => `
            <tr>${Array.from({length: 7}, (_, day) => {
              const d = week * 7 + day - 0;
              return d >= 1 && d <= 31 ? `<td><button>${d}</button></td>` : `<td></td>`;
            }).join("")}</tr>
          `).join("")}
        </tbody>
      </table>`),
    expected: [
      { type: "text", label: "March 2026" },
      { type: "button", label: "Previous Month" },
      { type: "button", label: "Today" },
      { type: "button", label: "Next Month" },
    ],
    minElements: 10,
  },
  {
    id: "app-006", name: "Media player", category: "apps",
    html: page("Player", `
      <h1>Now Playing</h1>
      <div>
        <h2>Bohemian Rhapsody</h2>
        <p>Queen - A Night at the Opera</p>
        <input type="range" aria-label="Seek" min="0" max="355" value="120">
        <span>2:00 / 5:55</span>
      </div>
      <div role="toolbar" aria-label="Playback controls">
        <button aria-label="Previous track">&#9198;</button>
        <button aria-label="Play">&#9654;</button>
        <button aria-label="Next track">&#9197;</button>
        <button aria-label="Shuffle">&#128256;</button>
        <button aria-label="Repeat">&#128257;</button>
      </div>
      <div>
        <label for="volume">Volume</label>
        <input id="volume" type="range" min="0" max="100" value="70">
      </div>`),
    expected: [
      { type: "button", label: "Play" },
      { type: "button", label: "Previous track" },
      { type: "button", label: "Next track" },
      { type: "slider", label: "Volume" },
    ],
    minElements: 6,
  },
  {
    id: "app-007", name: "Shopping cart", category: "apps",
    html: page("Cart", `
      <h1>Shopping Cart (3 items)</h1>
      <table>
        <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr></thead>
        <tbody>
          <tr><td>Laptop</td><td>$999</td><td><input type="number" value="1" aria-label="Laptop quantity"></td><td>$999</td><td><button>Remove</button></td></tr>
          <tr><td>Mouse</td><td>$49</td><td><input type="number" value="2" aria-label="Mouse quantity"></td><td>$98</td><td><button>Remove</button></td></tr>
          <tr><td>Keyboard</td><td>$79</td><td><input type="number" value="1" aria-label="Keyboard quantity"></td><td>$79</td><td><button>Remove</button></td></tr>
        </tbody>
      </table>
      <div><strong>Subtotal: $1,176.00</strong></div>
      <button>Continue Shopping</button>
      <button>Proceed to Checkout</button>`),
    expected: [
      { type: "input", label: "Laptop quantity" },
      { type: "button", label: "Remove" },
      { type: "button", label: "Continue Shopping" },
      { type: "button", label: "Proceed to Checkout" },
    ],
    minElements: 8,
  },
  {
    id: "app-008", name: "Admin panel", category: "apps",
    html: page("Admin", `
      <div style="display:flex">
        <nav style="width:200px" aria-label="Admin menu">
          <a href="#dash">Dashboard</a>
          <a href="#users">Users</a>
          <a href="#content">Content</a>
          <a href="#settings">Settings</a>
          <a href="#logs">Logs</a>
          <a href="#reports">Reports</a>
        </nav>
        <main style="flex:1;padding:16px">
          <h1>Admin Dashboard</h1>
          <div style="display:flex;gap:16px">
            <div><h3>Total Users</h3><p>12,345</p></div>
            <div><h3>Active Today</h3><p>1,234</p></div>
            <div><h3>Revenue</h3><p>$45,678</p></div>
          </div>
          <h2>Quick Actions</h2>
          <button>Create User</button>
          <button>Export Data</button>
          <button>View Logs</button>
          <button>System Health</button>
        </main>
      </div>`),
    expected: [
      { type: "link", label: "Dashboard" },
      { type: "link", label: "Users" },
      { type: "button", label: "Create User" },
      { type: "button", label: "Export Data" },
    ],
    minElements: 10,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 6: ACCESSIBILITY/ARIA (10 scenarios)
// ═══════════════════════════════════════════════

const a11yScenarios: Scenario[] = [
  {
    id: "a11y-001", name: "ARIA landmarks", category: "accessibility",
    html: page("Landmarks", `
      <header role="banner"><h1>Site Header</h1><nav aria-label="Main"><a href="#home">Home</a><a href="#about">About</a></nav></header>
      <main role="main">
        <h2>Main Content</h2>
        <p>This page demonstrates ARIA landmarks.</p>
        <aside role="complementary"><h3>Related Links</h3><a href="#link1">Link 1</a></aside>
      </main>
      <footer role="contentinfo"><p>Footer content</p><a href="#privacy">Privacy</a></footer>`),
    expected: [
      { type: "text", label: "Site Header" },
      { type: "link", label: "Home" },
      { type: "link", label: "About" },
      { type: "link", label: "Privacy" },
    ],
    minElements: 4,
  },
  {
    id: "a11y-002", name: "Live region updates", category: "accessibility",
    html: page("Live Region", `
      <h1>Notifications</h1>
      <div aria-live="polite" role="status">
        <p>3 new messages received</p>
      </div>
      <div aria-live="assertive" role="alert">
        <p>Warning: Server load is high</p>
      </div>
      <button>Refresh</button>
      <button>Dismiss All</button>`),
    expected: [
      { type: "button", label: "Refresh" },
      { type: "button", label: "Dismiss All" },
    ],
    minElements: 3,
  },
  {
    id: "a11y-003", name: "Custom ARIA widgets", category: "accessibility",
    html: page("Widgets", `
      <h1>Custom Widgets</h1>
      <div role="slider" aria-label="Temperature" aria-valuemin="0" aria-valuemax="100" aria-valuenow="72" tabindex="0">
        72°F
      </div>
      <div role="switch" aria-label="Dark mode" aria-checked="false" tabindex="0">Off</div>
      <div role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="45">45%</div>
      <div role="spinbutton" aria-label="Font size" aria-valuemin="8" aria-valuemax="72" aria-valuenow="14" tabindex="0">14px</div>`),
    expected: [
      { type: "text", label: "Custom Widgets" },
    ],
    minElements: 3,
  },
  {
    id: "a11y-004", name: "Form with descriptions", category: "accessibility",
    html: page("Described Form", `
      <h1>Accessible Form</h1>
      <form>
        <div>
          <label for="uname">Username</label>
          <input id="uname" type="text" aria-describedby="uname-desc" required>
          <span id="uname-desc">Must be 3-20 characters, letters and numbers only</span>
        </div>
        <div>
          <label for="pw">Password</label>
          <input id="pw" type="password" aria-describedby="pw-desc" required>
          <span id="pw-desc">Minimum 8 characters with one number</span>
        </div>
        <div aria-invalid="true">
          <label for="em">Email</label>
          <input id="em" type="email" aria-describedby="em-err" aria-invalid="true">
          <span id="em-err" role="alert">Please enter a valid email address</span>
        </div>
        <button type="submit">Create Account</button>
      </form>`),
    expected: [
      { type: "input", label: "Username", hasBounds: true },
      { type: "input", label: "Password", hasBounds: true },
      { type: "input", label: "Email", hasBounds: true },
      { type: "button", label: "Create Account", hasBounds: true },
    ],
    minElements: 4,
  },
  {
    id: "a11y-005", name: "Combobox with listbox", category: "accessibility",
    html: page("Combobox", `
      <h1>Country Selector</h1>
      <label for="country">Country</label>
      <div role="combobox" aria-expanded="true" aria-haspopup="listbox">
        <input id="country" type="text" aria-autocomplete="list" aria-controls="country-list" value="United">
        <ul id="country-list" role="listbox">
          <li role="option" aria-selected="true">United States</li>
          <li role="option">United Kingdom</li>
          <li role="option">United Arab Emirates</li>
        </ul>
      </div>`),
    expected: [
      { type: "input", label: "Country", hasBounds: true },
    ],
    minElements: 3,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 7: EDGE CASES (15 scenarios)
// ═══════════════════════════════════════════════

const edgeScenarios: Scenario[] = [
  {
    id: "edge-001", name: "Empty page", category: "edge",
    html: page("Empty", `<main></main>`),
    expected: [],
    minElements: 0,
  },
  {
    id: "edge-002", name: "Single button", category: "edge",
    html: page("Single", `<button>Click Me</button>`),
    expected: [
      { type: "button", label: "Click Me", hasBounds: true },
    ],
    minElements: 1,
  },
  {
    id: "edge-003", name: "100 buttons", category: "edge",
    html: page("Many Buttons", `
      <h1>Button Grid</h1>
      ${Array.from({length: 100}, (_, i) => `<button>Button ${i+1}</button>`).join("\n")}`),
    expected: [
      { type: "button", label: "Button 1" },
      { type: "button", label: "Button 100" },
    ],
    minElements: 100,
  },
  {
    id: "edge-004", name: "Deeply nested elements", category: "edge",
    html: page("Deep Nesting", `
      <h1>Deep</h1>
      ${Array.from({length: 12}, () => "<div>").join("")}
        <button>Deep Button</button>
        <input type="text" aria-label="Deep Input">
      ${Array.from({length: 12}, () => "</div>").join("")}`),
    expected: [
      { type: "button", label: "Deep Button", hasBounds: true },
      { type: "input", label: "Deep Input", hasBounds: true },
    ],
    minElements: 2,
  },
  {
    id: "edge-005", name: "Unicode and special characters", category: "edge",
    html: page("Unicode", `
      <h1>Ünïcödé Tëst 日本語 中文 العربية</h1>
      <button>Ação</button>
      <button>Ñoño</button>
      <button>Кнопка</button>
      <input type="text" aria-label="入力フィールド">
      <a href="#">リンク</a>
      <button>🚀 Launch</button>
      <button>✓ Accept</button>`),
    expected: [
      { type: "button", label: "Ação" },
      { type: "button", label: "Кнопка" },
      { type: "button", label: "Launch" },
    ],
    minElements: 5,
  },
  {
    id: "edge-006", name: "Hidden and disabled elements", category: "edge",
    html: page("Visibility", `
      <h1>Visibility Test</h1>
      <button>Visible Button</button>
      <button disabled>Disabled Button</button>
      <button style="display:none">Hidden Button</button>
      <button aria-hidden="true">ARIA Hidden</button>
      <input type="text" aria-label="Visible Input">
      <input type="text" aria-label="Disabled Input" disabled>
      <input type="hidden" value="secret">`),
    expected: [
      { type: "button", label: "Visible Button", hasBounds: true },
      { type: "input", label: "Visible Input", hasBounds: true },
    ],
    minElements: 2,
  },
  {
    id: "edge-007", name: "Iframe content", category: "edge",
    html: page("Iframe", `
      <h1>Page with Iframe</h1>
      <button>Main Page Button</button>
      <iframe srcdoc="<button>Iframe Button</button><input type='text' placeholder='Iframe Input'>" style="width:400px;height:200px" title="Embedded content"></iframe>`),
    expected: [
      { type: "button", label: "Main Page Button", hasBounds: true },
    ],
    minElements: 1,
  },
  {
    id: "edge-008", name: "Long text content", category: "edge",
    html: page("Long Text", `
      <h1>Article with Long Content</h1>
      ${Array.from({length: 20}, (_, i) => `<p>Paragraph ${i+1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`).join("")}
      <button>Back to Top</button>
      <button>Next Article</button>`),
    expected: [
      { type: "text", label: "Article with Long Content" },
      { type: "button", label: "Back to Top" },
      { type: "button", label: "Next Article" },
    ],
    minElements: 3,
  },
  {
    id: "edge-009", name: "Table with inputs in cells", category: "edge",
    html: page("Editable Table", `
      <h1>Data Entry</h1>
      <table>
        <thead><tr><th>Name</th><th>Value</th><th>Action</th></tr></thead>
        <tbody>
          ${Array.from({length: 5}, (_, i) => `
            <tr>
              <td>Field ${i+1}</td>
              <td><input type="text" aria-label="Value for field ${i+1}" value="data-${i+1}"></td>
              <td><button>Save</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>`),
    expected: [
      { type: "input", label: "Value for field 1", hasValue: true },
      { type: "button", label: "Save" },
    ],
    minElements: 10,
  },
  {
    id: "edge-010", name: "Only links", category: "edge",
    html: page("Links", `
      <nav>
        ${Array.from({length: 20}, (_, i) => `<a href="#page${i+1}">Page ${i+1}</a>`).join("<br>\n")})
      </nav>`),
    expected: [
      { type: "link", label: "Page 1" },
      { type: "link", label: "Page 20" },
    ],
    minElements: 20,
  },
  {
    id: "edge-011", name: "Mixed input types", category: "edge",
    html: page("All Inputs", `
      <h1>All Input Types</h1>
      <label>Text<input type="text"></label>
      <label>Password<input type="password"></label>
      <label>Email<input type="email"></label>
      <label>Number<input type="number"></label>
      <label>Tel<input type="tel"></label>
      <label>URL<input type="url"></label>
      <label>Search<input type="search"></label>
      <label>Date<input type="date"></label>
      <label>Time<input type="time"></label>
      <label>Color<input type="color"></label>
      <label>Range<input type="range"></label>
      <label>File<input type="file"></label>
      <label><input type="checkbox"> Checkbox</label>
      <label><input type="radio" name="r"> Radio A</label>
      <label><input type="radio" name="r"> Radio B</label>
      <button type="submit">Submit</button>
      <button type="reset">Reset</button>`),
    expected: [
      { type: "input" },
      { type: "checkbox" },
      { type: "button", label: "Submit" },
      { type: "button", label: "Reset" },
    ],
    minElements: 10,
  },
  {
    id: "edge-012", name: "Select with many options", category: "edge",
    html: page("Select", `
      <h1>Country Selection</h1>
      <label for="c">Country</label>
      <select id="c">
        ${["USA","UK","Canada","France","Germany","Japan","Australia","Brazil","India","China","Mexico","Spain","Italy","Russia","South Korea"].map(c => `<option>${c}</option>`).join("")}
      </select>
      <button>Confirm</button>`),
    expected: [
      { type: "button", label: "Confirm", hasBounds: true },
    ],
    minElements: 2,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 8: MEDIA & CONTENT (8 scenarios)
// ═══════════════════════════════════════════════

const mediaScenarios: Scenario[] = [
  {
    id: "media-001", name: "Video player controls", category: "media",
    html: page("Video Player", `
      <h1>Video Player</h1>
      <div role="region" aria-label="Video Player">
        <video width="640" height="360" controls>
          <source src="about:blank" type="video/mp4">
        </video>
        <div>
          <button aria-label="Play">Play</button>
          <button aria-label="Pause">Pause</button>
          <button aria-label="Mute">Mute</button>
          <input type="range" aria-label="Volume" min="0" max="100" value="75">
          <button aria-label="Fullscreen">Fullscreen</button>
          <span>00:00 / 03:45</span>
        </div>
      </div>`),
    expected: [
      { type: "button", label: "Play", hasBounds: true },
      { type: "button", label: "Pause" },
      { type: "button", label: "Mute" },
      { type: "button", label: "Fullscreen" },
    ],
    minElements: 5,
  },
  {
    id: "media-002", name: "Image gallery with thumbnails", category: "media",
    html: page("Gallery", `
      <h1>Photo Gallery</h1>
      <nav aria-label="Gallery navigation">
        <button aria-label="Previous">Previous</button>
        <span>3 of 12</span>
        <button aria-label="Next">Next</button>
      </nav>
      <figure>
        <img src="about:blank" alt="Sunset over mountains" width="600" height="400">
        <figcaption>Sunset over mountains — Photo by John Doe</figcaption>
      </figure>
      <div role="list" aria-label="Thumbnails">
        <button role="listitem" aria-label="Thumbnail 1">1</button>
        <button role="listitem" aria-label="Thumbnail 2">2</button>
        <button role="listitem" aria-label="Thumbnail 3" aria-current="true">3</button>
        <button role="listitem" aria-label="Thumbnail 4">4</button>
      </div>`),
    expected: [
      { type: "button", label: "Previous" },
      { type: "button", label: "Next" },
      { type: "text", label: "Sunset over mountains" },
    ],
    minElements: 6,
  },
  {
    id: "media-003", name: "Audio playlist", category: "media",
    html: page("Playlist", `
      <h1>My Playlist</h1>
      <div role="list" aria-label="Playlist">
        <div role="listitem"><span>1. Song Alpha</span> <span>3:42</span> <button>Play</button></div>
        <div role="listitem"><span>2. Song Beta</span> <span>4:15</span> <button>Play</button></div>
        <div role="listitem"><span>3. Song Gamma</span> <span>2:58</span> <button>Play</button></div>
        <div role="listitem"><span>4. Song Delta</span> <span>5:01</span> <button>Play</button></div>
      </div>
      <div>
        <button>Shuffle</button>
        <button>Repeat</button>
        <button>Previous</button>
        <button>Next</button>
      </div>`),
    expected: [
      { type: "text", label: "Song Alpha" },
      { type: "text", label: "Song Beta" },
      { type: "button", label: "Shuffle" },
      { type: "button", label: "Repeat" },
    ],
    minElements: 8,
  },
  {
    id: "media-004", name: "Document viewer", category: "media",
    html: page("Document Viewer", `
      <h1>Document Viewer</h1>
      <nav aria-label="Document toolbar">
        <button>Zoom In</button>
        <button>Zoom Out</button>
        <span>100%</span>
        <button>Fit Width</button>
        <button>Download</button>
        <button>Print</button>
      </nav>
      <div>
        <label for="pg">Page</label>
        <input id="pg" type="number" value="1" min="1" max="24">
        <span>of 24</span>
      </div>
      <div role="document" aria-label="Document content">
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      </div>`),
    expected: [
      { type: "button", label: "Zoom In" },
      { type: "button", label: "Zoom Out" },
      { type: "button", label: "Download" },
      { type: "button", label: "Print" },
    ],
    minElements: 6,
  },
  {
    id: "media-005", name: "Podcast episode list", category: "media",
    html: page("Podcasts", `
      <h1>Tech Talks Podcast</h1>
      <p>Weekly discussions about technology</p>
      <div role="list" aria-label="Episodes">
        <article role="listitem">
          <h2>Episode 42: AI and the Future</h2>
          <p>Published: March 1, 2026 — Duration: 45 min</p>
          <button>Play Episode</button>
          <button>Download</button>
        </article>
        <article role="listitem">
          <h2>Episode 41: Web Performance</h2>
          <p>Published: Feb 22, 2026 — Duration: 38 min</p>
          <button>Play Episode</button>
          <button>Download</button>
        </article>
        <article role="listitem">
          <h2>Episode 40: Rust in Production</h2>
          <p>Published: Feb 15, 2026 — Duration: 52 min</p>
          <button>Play Episode</button>
          <button>Download</button>
        </article>
      </div>`),
    expected: [
      { type: "text", label: "Episode 42" },
      { type: "text", label: "Episode 41" },
      { type: "button", label: "Play Episode" },
    ],
    minElements: 8,
  },
  {
    id: "media-006", name: "Map with controls", category: "media",
    html: page("Map", `
      <h1>Location Map</h1>
      <div role="application" aria-label="Interactive map">
        <div style="width:600px;height:400px;background:#ddd;display:flex;align-items:center;justify-content:center">
          <span>Map Area</span>
        </div>
        <div>
          <button aria-label="Zoom in">+</button>
          <button aria-label="Zoom out">-</button>
          <button>Satellite</button>
          <button>Terrain</button>
          <button>My Location</button>
        </div>
      </div>
      <input type="search" placeholder="Search location..." aria-label="Search location">`),
    expected: [
      { type: "button", label: "Satellite" },
      { type: "button", label: "Terrain" },
      { type: "button", label: "My Location" },
      { type: "input", label: "Search location" },
    ],
    minElements: 5,
  },
  {
    id: "media-007", name: "File manager", category: "media",
    html: page("File Manager", `
      <h1>File Manager</h1>
      <nav aria-label="File actions">
        <button>New Folder</button>
        <button>Upload</button>
        <button>Delete</button>
        <button>Rename</button>
        <button>Move</button>
      </nav>
      <div>
        <label for="search-files">Search files</label>
        <input id="search-files" type="search" placeholder="Search...">
      </div>
      <table aria-label="Files">
        <thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>
        <tbody>
          <tr><td>Documents</td><td>—</td><td>Mar 10</td></tr>
          <tr><td>Photos</td><td>—</td><td>Mar 8</td></tr>
          <tr><td>report.pdf</td><td>2.4 MB</td><td>Mar 12</td></tr>
          <tr><td>notes.txt</td><td>12 KB</td><td>Mar 14</td></tr>
        </tbody>
      </table>`),
    expected: [
      { type: "button", label: "New Folder" },
      { type: "button", label: "Upload" },
      { type: "button", label: "Delete" },
      { type: "input", label: "Search files" },
      { type: "text", label: "Documents" },
    ],
    minElements: 10,
  },
  {
    id: "media-008", name: "Presentation slides", category: "media",
    html: page("Slides", `
      <h1>Presentation</h1>
      <div role="region" aria-label="Slide">
        <h2>Welcome to Our Product</h2>
        <p>Building the future of desktop automation</p>
        <ul>
          <li>Feature 1: Context awareness</li>
          <li>Feature 2: AI-powered actions</li>
          <li>Feature 3: Cross-platform support</li>
        </ul>
      </div>
      <nav aria-label="Slide controls">
        <button>Previous Slide</button>
        <span>Slide 3 of 15</span>
        <button>Next Slide</button>
        <button>Present</button>
        <button>Speaker Notes</button>
      </nav>`),
    expected: [
      { type: "text", label: "Welcome to Our Product" },
      { type: "button", label: "Previous Slide" },
      { type: "button", label: "Next Slide" },
      { type: "button", label: "Present" },
    ],
    minElements: 8,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 9: SETTINGS & PREFERENCES (7 scenarios)
// ═══════════════════════════════════════════════

const settingsScenarios: Scenario[] = [
  {
    id: "settings-001", name: "Notification preferences", category: "settings",
    html: page("Notifications", `
      <h1>Notification Settings</h1>
      <form>
        <fieldset>
          <legend>Email Notifications</legend>
          <label><input type="checkbox" checked> Product updates</label>
          <label><input type="checkbox" checked> Security alerts</label>
          <label><input type="checkbox"> Marketing emails</label>
          <label><input type="checkbox"> Weekly digest</label>
        </fieldset>
        <fieldset>
          <legend>Push Notifications</legend>
          <label><input type="checkbox" checked> Direct messages</label>
          <label><input type="checkbox"> Mentions</label>
          <label><input type="checkbox" checked> Task assignments</label>
        </fieldset>
        <button type="submit">Save Preferences</button>
      </form>`),
    expected: [
      { type: "check_box", label: "Product updates" },
      { type: "check_box", label: "Security alerts" },
      { type: "check_box", label: "Marketing" },
      { type: "check_box", label: "Direct messages" },
      { type: "button", label: "Save Preferences" },
    ],
    minElements: 8,
  },
  {
    id: "settings-002", name: "Theme and appearance", category: "settings",
    html: page("Appearance", `
      <h1>Appearance Settings</h1>
      <div>
        <h2>Theme</h2>
        <label><input type="radio" name="theme" checked> Light</label>
        <label><input type="radio" name="theme"> Dark</label>
        <label><input type="radio" name="theme"> System</label>
      </div>
      <div>
        <h2>Font Size</h2>
        <label for="fs">Size</label>
        <select id="fs">
          <option>Small</option>
          <option selected>Medium</option>
          <option>Large</option>
          <option>Extra Large</option>
        </select>
      </div>
      <div>
        <h2>Accent Color</h2>
        <label for="ac">Color</label>
        <input type="color" id="ac" value="#0066ff">
      </div>
      <button>Apply</button>
      <button>Reset to Default</button>`),
    expected: [
      { type: "radio_button", label: "Light" },
      { type: "radio_button", label: "Dark" },
      { type: "radio_button", label: "System" },
      { type: "button", label: "Apply" },
      { type: "button", label: "Reset to Default" },
    ],
    minElements: 8,
  },
  {
    id: "settings-003", name: "Privacy settings", category: "settings",
    html: page("Privacy", `
      <h1>Privacy Settings</h1>
      <section>
        <h2>Data Collection</h2>
        <label><input type="checkbox" checked> Allow usage analytics</label>
        <label><input type="checkbox"> Share crash reports</label>
        <label><input type="checkbox"> Personalized recommendations</label>
      </section>
      <section>
        <h2>Visibility</h2>
        <label for="profile-vis">Profile visibility</label>
        <select id="profile-vis">
          <option>Public</option>
          <option selected>Friends only</option>
          <option>Private</option>
        </select>
      </section>
      <section>
        <h2>Account</h2>
        <button>Download My Data</button>
        <button>Delete Account</button>
      </section>
      <button type="submit">Save Settings</button>`),
    expected: [
      { type: "check_box", label: "usage analytics" },
      { type: "check_box", label: "crash reports" },
      { type: "button", label: "Download My Data" },
      { type: "button", label: "Delete Account" },
      { type: "button", label: "Save Settings" },
    ],
    minElements: 8,
  },
  {
    id: "settings-004", name: "Keyboard shortcuts settings", category: "settings",
    html: page("Shortcuts", `
      <h1>Keyboard Shortcuts</h1>
      <table aria-label="Keyboard shortcuts">
        <thead><tr><th>Action</th><th>Shortcut</th><th></th></tr></thead>
        <tbody>
          <tr><td>Save</td><td>Ctrl+S</td><td><button>Edit</button></td></tr>
          <tr><td>Undo</td><td>Ctrl+Z</td><td><button>Edit</button></td></tr>
          <tr><td>Redo</td><td>Ctrl+Y</td><td><button>Edit</button></td></tr>
          <tr><td>Find</td><td>Ctrl+F</td><td><button>Edit</button></td></tr>
          <tr><td>Copy</td><td>Ctrl+C</td><td><button>Edit</button></td></tr>
          <tr><td>Paste</td><td>Ctrl+V</td><td><button>Edit</button></td></tr>
        </tbody>
      </table>
      <button>Reset All to Default</button>`),
    expected: [
      { type: "text", label: "Save" },
      { type: "text", label: "Ctrl+S" },
      { type: "button", label: "Edit" },
      { type: "button", label: "Reset All to Default" },
    ],
    minElements: 10,
  },
  {
    id: "settings-005", name: "Language and region", category: "settings",
    html: page("Language", `
      <h1>Language & Region</h1>
      <div>
        <label for="lang">Language</label>
        <select id="lang">
          <option selected>English (US)</option>
          <option>English (UK)</option>
          <option>Spanish</option>
          <option>French</option>
          <option>German</option>
          <option>Japanese</option>
        </select>
      </div>
      <div>
        <label for="tz">Timezone</label>
        <select id="tz">
          <option>UTC-8 Pacific</option>
          <option selected>UTC-5 Eastern</option>
          <option>UTC+0 London</option>
          <option>UTC+1 Berlin</option>
          <option>UTC+9 Tokyo</option>
        </select>
      </div>
      <div>
        <label for="df">Date Format</label>
        <select id="df">
          <option selected>MM/DD/YYYY</option>
          <option>DD/MM/YYYY</option>
          <option>YYYY-MM-DD</option>
        </select>
      </div>
      <button>Save</button>`),
    expected: [
      { type: "text", label: "Language" },
      { type: "text", label: "Timezone" },
      { type: "text", label: "Date Format" },
      { type: "button", label: "Save" },
    ],
    minElements: 5,
  },
  {
    id: "settings-006", name: "Account security settings", category: "settings",
    html: page("Security", `
      <h1>Security Settings</h1>
      <section>
        <h2>Password</h2>
        <p>Last changed: 30 days ago</p>
        <button>Change Password</button>
      </section>
      <section>
        <h2>Two-Factor Authentication</h2>
        <p>Status: Enabled</p>
        <button>Configure 2FA</button>
        <button>Generate Backup Codes</button>
      </section>
      <section>
        <h2>Active Sessions</h2>
        <div>
          <span>Chrome on macOS — Current session</span>
          <button>Revoke</button>
        </div>
        <div>
          <span>Firefox on Windows — 2 days ago</span>
          <button>Revoke</button>
        </div>
        <button>Revoke All Other Sessions</button>
      </section>`),
    expected: [
      { type: "button", label: "Change Password" },
      { type: "button", label: "Configure 2FA" },
      { type: "button", label: "Generate Backup Codes" },
      { type: "button", label: "Revoke All Other Sessions" },
    ],
    minElements: 8,
  },
  {
    id: "settings-007", name: "Integration connections", category: "settings",
    html: page("Integrations", `
      <h1>Connected Integrations</h1>
      <div role="list" aria-label="Integrations">
        <div role="listitem">
          <h3>GitHub</h3>
          <p>Connected as @developer</p>
          <button>Disconnect</button>
        </div>
        <div role="listitem">
          <h3>Slack</h3>
          <p>Connected to #general</p>
          <button>Disconnect</button>
        </div>
        <div role="listitem">
          <h3>Google Drive</h3>
          <p>Not connected</p>
          <button>Connect</button>
        </div>
        <div role="listitem">
          <h3>Jira</h3>
          <p>Not connected</p>
          <button>Connect</button>
        </div>
      </div>`),
    expected: [
      { type: "text", label: "GitHub" },
      { type: "text", label: "Slack" },
      { type: "button", label: "Disconnect" },
      { type: "button", label: "Connect" },
    ],
    minElements: 8,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 10: DASHBOARDS & ANALYTICS (7 scenarios)
// ═══════════════════════════════════════════════

const dashboardScenarios: Scenario[] = [
  {
    id: "dash-001", name: "Analytics overview", category: "dashboard",
    html: page("Analytics", `
      <h1>Analytics Dashboard</h1>
      <nav aria-label="Time range">
        <button>Today</button>
        <button>7 Days</button>
        <button aria-pressed="true">30 Days</button>
        <button>90 Days</button>
      </nav>
      <div role="region" aria-label="Key metrics">
        <div><h3>Total Users</h3><span>12,458</span></div>
        <div><h3>Active Today</h3><span>3,291</span></div>
        <div><h3>Revenue</h3><span>$45,672</span></div>
        <div><h3>Conversion Rate</h3><span>3.2%</span></div>
      </div>
      <div role="img" aria-label="Traffic chart">Chart placeholder</div>`),
    expected: [
      { type: "button", label: "Today" },
      { type: "button", label: "7 Days" },
      { type: "button", label: "30 Days" },
      { type: "text", label: "Total Users" },
      { type: "text", label: "Revenue" },
    ],
    minElements: 8,
  },
  {
    id: "dash-002", name: "Server monitoring", category: "dashboard",
    html: page("Servers", `
      <h1>Server Status</h1>
      <table aria-label="Server status">
        <thead><tr><th>Server</th><th>Status</th><th>CPU</th><th>Memory</th><th>Actions</th></tr></thead>
        <tbody>
          <tr><td>web-01</td><td>Running</td><td>45%</td><td>62%</td><td><button>Restart</button></td></tr>
          <tr><td>web-02</td><td>Running</td><td>38%</td><td>55%</td><td><button>Restart</button></td></tr>
          <tr><td>db-01</td><td>Warning</td><td>82%</td><td>91%</td><td><button>Restart</button></td></tr>
          <tr><td>worker-01</td><td>Stopped</td><td>0%</td><td>0%</td><td><button>Start</button></td></tr>
        </tbody>
      </table>
      <button>Refresh All</button>`),
    expected: [
      { type: "text", label: "web-01" },
      { type: "text", label: "db-01" },
      { type: "button", label: "Restart" },
      { type: "button", label: "Refresh All" },
    ],
    minElements: 10,
  },
  {
    id: "dash-003", name: "User management table", category: "dashboard",
    html: page("Users", `
      <h1>User Management</h1>
      <div>
        <input type="search" placeholder="Search users..." aria-label="Search users">
        <button>Add User</button>
        <button>Export CSV</button>
      </div>
      <table aria-label="Users">
        <thead><tr><th><input type="checkbox" aria-label="Select all"></th><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>
          <tr><td><input type="checkbox" aria-label="Select Alice"></td><td>Alice Johnson</td><td>alice@example.com</td><td>Admin</td><td><button>Edit</button> <button>Delete</button></td></tr>
          <tr><td><input type="checkbox" aria-label="Select Bob"></td><td>Bob Smith</td><td>bob@example.com</td><td>User</td><td><button>Edit</button> <button>Delete</button></td></tr>
          <tr><td><input type="checkbox" aria-label="Select Carol"></td><td>Carol Williams</td><td>carol@example.com</td><td>Editor</td><td><button>Edit</button> <button>Delete</button></td></tr>
        </tbody>
      </table>
      <nav aria-label="Pagination"><button>Previous</button><span>Page 1 of 5</span><button>Next</button></nav>`),
    expected: [
      { type: "input", label: "Search users" },
      { type: "button", label: "Add User" },
      { type: "button", label: "Export CSV" },
      { type: "text", label: "Alice Johnson" },
      { type: "button", label: "Edit" },
    ],
    minElements: 15,
  },
  {
    id: "dash-004", name: "Activity feed", category: "dashboard",
    html: page("Activity", `
      <h1>Recent Activity</h1>
      <div>
        <label for="filter">Filter by</label>
        <select id="filter">
          <option>All Activity</option>
          <option>Commits</option>
          <option>Issues</option>
          <option>Pull Requests</option>
        </select>
      </div>
      <div role="feed" aria-label="Activity feed">
        <article><p>Alice merged PR #142: Fix login bug</p><time>2 hours ago</time></article>
        <article><p>Bob opened issue #87: Performance regression</p><time>3 hours ago</time></article>
        <article><p>Carol pushed 3 commits to main</p><time>5 hours ago</time></article>
        <article><p>Dave commented on PR #140</p><time>6 hours ago</time></article>
        <article><p>Eve deployed v2.4.1 to production</p><time>8 hours ago</time></article>
      </div>
      <button>Load More</button>`),
    expected: [
      { type: "text", label: "Alice merged" },
      { type: "text", label: "Bob opened" },
      { type: "button", label: "Load More" },
    ],
    minElements: 6,
  },
  {
    id: "dash-005", name: "Error log viewer", category: "dashboard",
    html: page("Error Logs", `
      <h1>Error Logs</h1>
      <div>
        <label for="severity">Severity</label>
        <select id="severity"><option>All</option><option>Error</option><option>Warning</option><option>Info</option></select>
        <input type="search" placeholder="Filter logs..." aria-label="Filter logs">
        <button>Refresh</button>
        <button>Clear All</button>
      </div>
      <table aria-label="Error logs">
        <thead><tr><th>Time</th><th>Severity</th><th>Message</th><th>Source</th></tr></thead>
        <tbody>
          <tr><td>14:32:01</td><td>ERROR</td><td>Connection timeout to database</td><td>db-pool</td></tr>
          <tr><td>14:31:45</td><td>WARN</td><td>Rate limit approaching</td><td>api-gateway</td></tr>
          <tr><td>14:30:22</td><td>ERROR</td><td>Authentication failed: invalid token</td><td>auth-service</td></tr>
          <tr><td>14:29:58</td><td>INFO</td><td>Cache cleared successfully</td><td>cache-mgr</td></tr>
        </tbody>
      </table>`),
    expected: [
      { type: "input", label: "Filter logs" },
      { type: "button", label: "Refresh" },
      { type: "button", label: "Clear All" },
      { type: "text", label: "Connection timeout" },
    ],
    minElements: 10,
  },
  {
    id: "dash-006", name: "Project overview cards", category: "dashboard",
    html: page("Projects", `
      <h1>My Projects</h1>
      <div>
        <button>New Project</button>
        <label for="sort">Sort by</label>
        <select id="sort"><option>Last updated</option><option>Name</option><option>Created</option></select>
      </div>
      <div role="list" aria-label="Projects">
        <article role="listitem">
          <h2>Website Redesign</h2>
          <p>Progress: 75%</p>
          <p>Team: 5 members</p>
          <button>Open</button>
          <button>Settings</button>
        </article>
        <article role="listitem">
          <h2>Mobile App v2</h2>
          <p>Progress: 40%</p>
          <p>Team: 3 members</p>
          <button>Open</button>
          <button>Settings</button>
        </article>
        <article role="listitem">
          <h2>API Migration</h2>
          <p>Progress: 90%</p>
          <p>Team: 2 members</p>
          <button>Open</button>
          <button>Settings</button>
        </article>
      </div>`),
    expected: [
      { type: "button", label: "New Project" },
      { type: "text", label: "Website Redesign" },
      { type: "text", label: "Mobile App v2" },
      { type: "button", label: "Open" },
    ],
    minElements: 10,
  },
  {
    id: "dash-007", name: "Notification center", category: "dashboard",
    html: page("Notifications", `
      <h1>Notifications</h1>
      <div>
        <button>Mark All Read</button>
        <button>Settings</button>
      </div>
      <div role="list" aria-label="Notifications">
        <div role="listitem" aria-label="Unread notification">
          <p><strong>Build failed</strong> — Pipeline #456 failed on main</p>
          <time>10 min ago</time>
          <button>Dismiss</button>
        </div>
        <div role="listitem" aria-label="Unread notification">
          <p><strong>New comment</strong> — Alice commented on your PR</p>
          <time>25 min ago</time>
          <button>Dismiss</button>
        </div>
        <div role="listitem">
          <p><strong>Deploy complete</strong> — v2.3 deployed to staging</p>
          <time>1 hour ago</time>
          <button>Dismiss</button>
        </div>
      </div>`),
    expected: [
      { type: "button", label: "Mark All Read" },
      { type: "text", label: "Build failed" },
      { type: "text", label: "New comment" },
      { type: "button", label: "Dismiss" },
    ],
    minElements: 6,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 11: E-COMMERCE (7 scenarios)
// ═══════════════════════════════════════════════

const ecommerceScenarios: Scenario[] = [
  {
    id: "ecom-001", name: "Product listing page", category: "ecommerce",
    html: page("Products", `
      <h1>Electronics</h1>
      <div>
        <label for="sort">Sort by</label>
        <select id="sort"><option>Price: Low to High</option><option>Price: High to Low</option><option>Newest</option><option>Rating</option></select>
        <label for="cat">Category</label>
        <select id="cat"><option>All</option><option>Laptops</option><option>Phones</option><option>Tablets</option></select>
      </div>
      <div role="list" aria-label="Products">
        <article role="listitem">
          <h2>Laptop Pro 15</h2>
          <p>$1,299.00</p>
          <p>Rating: 4.5/5</p>
          <button>Add to Cart</button>
          <button>Quick View</button>
        </article>
        <article role="listitem">
          <h2>Smartphone Ultra</h2>
          <p>$899.00</p>
          <p>Rating: 4.7/5</p>
          <button>Add to Cart</button>
          <button>Quick View</button>
        </article>
        <article role="listitem">
          <h2>Tablet Air</h2>
          <p>$649.00</p>
          <p>Rating: 4.3/5</p>
          <button>Add to Cart</button>
          <button>Quick View</button>
        </article>
      </div>
      <nav aria-label="Pagination"><button>1</button><button>2</button><button>3</button><button>Next</button></nav>`),
    expected: [
      { type: "text", label: "Laptop Pro 15" },
      { type: "text", label: "Smartphone Ultra" },
      { type: "button", label: "Add to Cart" },
      { type: "button", label: "Quick View" },
    ],
    minElements: 12,
  },
  {
    id: "ecom-002", name: "Product detail page", category: "ecommerce",
    html: page("Product Detail", `
      <nav aria-label="Breadcrumb"><a href="#">Home</a> / <a href="#">Electronics</a> / <span>Laptop Pro 15</span></nav>
      <h1>Laptop Pro 15</h1>
      <p>$1,299.00</p>
      <div>
        <label for="color">Color</label>
        <select id="color"><option>Silver</option><option>Space Gray</option><option>Gold</option></select>
      </div>
      <div>
        <label for="qty">Quantity</label>
        <input id="qty" type="number" value="1" min="1" max="10">
      </div>
      <button>Add to Cart</button>
      <button>Buy Now</button>
      <button>Add to Wishlist</button>
      <div>
        <h2>Description</h2>
        <p>15-inch display, 16GB RAM, 512GB SSD</p>
      </div>
      <div>
        <h2>Reviews (128)</h2>
        <div><span>John D.</span> <span>5 stars</span> <p>Great laptop!</p></div>
        <div><span>Jane S.</span> <span>4 stars</span> <p>Good value for money</p></div>
      </div>`),
    expected: [
      { type: "text", label: "Laptop Pro 15" },
      { type: "button", label: "Add to Cart" },
      { type: "button", label: "Buy Now" },
      { type: "button", label: "Add to Wishlist" },
      { type: "link", label: "Home" },
    ],
    minElements: 10,
  },
  {
    id: "ecom-003", name: "Shopping cart with items", category: "ecommerce",
    html: page("Cart", `
      <h1>Shopping Cart (3 items)</h1>
      <table aria-label="Cart items">
        <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr></thead>
        <tbody>
          <tr>
            <td>Laptop Pro 15</td><td>$1,299</td>
            <td><input type="number" value="1" min="1" aria-label="Quantity for Laptop"></td>
            <td>$1,299</td><td><button>Remove</button></td>
          </tr>
          <tr>
            <td>Wireless Mouse</td><td>$49</td>
            <td><input type="number" value="2" min="1" aria-label="Quantity for Mouse"></td>
            <td>$98</td><td><button>Remove</button></td>
          </tr>
          <tr>
            <td>USB-C Cable</td><td>$19</td>
            <td><input type="number" value="1" min="1" aria-label="Quantity for Cable"></td>
            <td>$19</td><td><button>Remove</button></td>
          </tr>
        </tbody>
      </table>
      <div>
        <p>Subtotal: $1,416.00</p>
        <label for="promo">Promo Code</label>
        <input id="promo" type="text" placeholder="Enter code">
        <button>Apply</button>
      </div>
      <button>Continue Shopping</button>
      <button>Checkout</button>`),
    expected: [
      { type: "text", label: "Laptop Pro 15" },
      { type: "button", label: "Remove" },
      { type: "input", label: "Quantity for Laptop" },
      { type: "button", label: "Checkout" },
      { type: "button", label: "Apply" },
    ],
    minElements: 12,
  },
  {
    id: "ecom-004", name: "Checkout flow", category: "ecommerce",
    html: page("Checkout", `
      <h1>Checkout</h1>
      <nav aria-label="Checkout steps">
        <span aria-current="step">1. Shipping</span>
        <span>2. Payment</span>
        <span>3. Review</span>
      </nav>
      <form>
        <h2>Shipping Address</h2>
        <label for="fn">First Name</label><input id="fn" type="text" required>
        <label for="ln">Last Name</label><input id="ln" type="text" required>
        <label for="addr">Address</label><input id="addr" type="text" required>
        <label for="city">City</label><input id="city" type="text" required>
        <label for="state">State</label>
        <select id="state"><option>California</option><option>New York</option><option>Texas</option></select>
        <label for="zip">ZIP Code</label><input id="zip" type="text" required>
        <h2>Shipping Method</h2>
        <label><input type="radio" name="ship" checked> Standard (5-7 days) — Free</label>
        <label><input type="radio" name="ship"> Express (2-3 days) — $9.99</label>
        <label><input type="radio" name="ship"> Overnight — $24.99</label>
        <button type="submit">Continue to Payment</button>
      </form>`),
    expected: [
      { type: "input", label: "First Name" },
      { type: "input", label: "Last Name" },
      { type: "input", label: "Address" },
      { type: "radio_button", label: "Standard" },
      { type: "button", label: "Continue to Payment" },
    ],
    minElements: 10,
  },
  {
    id: "ecom-005", name: "Order confirmation", category: "ecommerce",
    html: page("Order Confirmed", `
      <h1>Order Confirmed!</h1>
      <p>Thank you for your purchase.</p>
      <div role="region" aria-label="Order details">
        <h2>Order #ORD-2026-0342</h2>
        <p>Estimated delivery: March 22-24, 2026</p>
        <table aria-label="Order summary">
          <tr><td>Laptop Pro 15</td><td>$1,299.00</td></tr>
          <tr><td>Wireless Mouse x2</td><td>$98.00</td></tr>
          <tr><td>Shipping</td><td>Free</td></tr>
          <tr><td><strong>Total</strong></td><td><strong>$1,397.00</strong></td></tr>
        </table>
      </div>
      <button>Track Order</button>
      <button>Continue Shopping</button>
      <a href="#">View Order History</a>`),
    expected: [
      { type: "text", label: "Order Confirmed" },
      { type: "text", label: "ORD-2026-0342" },
      { type: "button", label: "Track Order" },
      { type: "button", label: "Continue Shopping" },
      { type: "link", label: "Order History" },
    ],
    minElements: 6,
  },
  {
    id: "ecom-006", name: "Product reviews page", category: "ecommerce",
    html: page("Reviews", `
      <h1>Customer Reviews — Laptop Pro 15</h1>
      <div>
        <h2>Overall Rating: 4.5/5 (128 reviews)</h2>
        <button>Write a Review</button>
      </div>
      <div>
        <label for="sort-rev">Sort by</label>
        <select id="sort-rev"><option>Most Recent</option><option>Highest Rated</option><option>Lowest Rated</option></select>
      </div>
      <div role="list" aria-label="Reviews">
        <article role="listitem">
          <h3>Amazing performance</h3>
          <p>5 stars — by John D. on March 1, 2026</p>
          <p>This laptop exceeds all my expectations for development work.</p>
          <button>Helpful (12)</button>
          <button>Report</button>
        </article>
        <article role="listitem">
          <h3>Good but pricey</h3>
          <p>4 stars — by Jane S. on Feb 28, 2026</p>
          <p>Solid build quality but wish it was cheaper.</p>
          <button>Helpful (8)</button>
          <button>Report</button>
        </article>
      </div>`),
    expected: [
      { type: "button", label: "Write a Review" },
      { type: "text", label: "Amazing performance" },
      { type: "text", label: "Good but pricey" },
      { type: "button", label: "Helpful" },
    ],
    minElements: 8,
  },
  {
    id: "ecom-007", name: "Wishlist page", category: "ecommerce",
    html: page("Wishlist", `
      <h1>My Wishlist (4 items)</h1>
      <div role="list" aria-label="Wishlist items">
        <div role="listitem">
          <h3>Laptop Pro 15</h3><p>$1,299.00 — In Stock</p>
          <button>Add to Cart</button><button>Remove</button>
        </div>
        <div role="listitem">
          <h3>Mechanical Keyboard</h3><p>$179.00 — In Stock</p>
          <button>Add to Cart</button><button>Remove</button>
        </div>
        <div role="listitem">
          <h3>4K Monitor</h3><p>$549.00 — Out of Stock</p>
          <button disabled>Out of Stock</button><button>Remove</button>
        </div>
        <div role="listitem">
          <h3>Noise Cancelling Headphones</h3><p>$349.00 — In Stock</p>
          <button>Add to Cart</button><button>Remove</button>
        </div>
      </div>
      <button>Add All to Cart</button>
      <button>Share Wishlist</button>`),
    expected: [
      { type: "text", label: "Laptop Pro 15" },
      { type: "text", label: "Mechanical Keyboard" },
      { type: "button", label: "Add to Cart" },
      { type: "button", label: "Add All to Cart" },
    ],
    minElements: 10,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 12: COMMUNICATION (7 scenarios)
// ═══════════════════════════════════════════════

const communicationScenarios: Scenario[] = [
  {
    id: "comm-001", name: "Email compose", category: "communication",
    html: page("Compose Email", `
      <h1>New Message</h1>
      <form>
        <label for="to">To</label>
        <input id="to" type="email" placeholder="recipient@example.com">
        <label for="cc">CC</label>
        <input id="cc" type="email" placeholder="cc@example.com">
        <label for="subject">Subject</label>
        <input id="subject" type="text" placeholder="Enter subject">
        <label for="body">Message</label>
        <textarea id="body" rows="10" placeholder="Write your message..."></textarea>
        <div>
          <button>Send</button>
          <button>Save Draft</button>
          <button>Attach File</button>
          <button>Discard</button>
        </div>
      </form>`),
    expected: [
      { type: "input", label: "To" },
      { type: "input", label: "Subject" },
      { type: "button", label: "Send" },
      { type: "button", label: "Save Draft" },
      { type: "button", label: "Attach File" },
    ],
    minElements: 6,
  },
  {
    id: "comm-002", name: "Chat conversation", category: "communication",
    html: page("Chat", `
      <h1>Team Chat — #engineering</h1>
      <div role="log" aria-label="Chat messages">
        <div><strong>Alice</strong> <time>10:30 AM</time><p>Has anyone reviewed the PR?</p></div>
        <div><strong>Bob</strong> <time>10:32 AM</time><p>I'll take a look now.</p></div>
        <div><strong>Carol</strong> <time>10:35 AM</time><p>I already approved it. LGTM!</p></div>
        <div><strong>Alice</strong> <time>10:36 AM</time><p>Great, merging now. Thanks!</p></div>
      </div>
      <div>
        <input type="text" placeholder="Type a message..." aria-label="Message input">
        <button>Send</button>
        <button aria-label="Attach">Attach</button>
        <button aria-label="Emoji">Emoji</button>
      </div>`),
    expected: [
      { type: "text", label: "Alice" },
      { type: "text", label: "reviewed the PR" },
      { type: "input", label: "Message input" },
      { type: "button", label: "Send" },
    ],
    minElements: 6,
  },
  {
    id: "comm-003", name: "Contact list", category: "communication",
    html: page("Contacts", `
      <h1>Contacts</h1>
      <input type="search" placeholder="Search contacts..." aria-label="Search contacts">
      <div>
        <button>Add Contact</button>
        <button>Import</button>
      </div>
      <div role="list" aria-label="Contacts">
        <div role="listitem">
          <h3>Alice Johnson</h3>
          <p>alice@example.com — Engineering</p>
          <button>Message</button><button>Call</button>
        </div>
        <div role="listitem">
          <h3>Bob Smith</h3>
          <p>bob@example.com — Design</p>
          <button>Message</button><button>Call</button>
        </div>
        <div role="listitem">
          <h3>Carol Williams</h3>
          <p>carol@example.com — Product</p>
          <button>Message</button><button>Call</button>
        </div>
      </div>`),
    expected: [
      { type: "input", label: "Search contacts" },
      { type: "button", label: "Add Contact" },
      { type: "text", label: "Alice Johnson" },
      { type: "button", label: "Message" },
      { type: "button", label: "Call" },
    ],
    minElements: 8,
  },
  {
    id: "comm-004", name: "Video call interface", category: "communication",
    html: page("Video Call", `
      <h1>Video Call — Team Standup</h1>
      <div role="region" aria-label="Participants">
        <div><span>Alice Johnson</span> <span>Speaking</span></div>
        <div><span>Bob Smith</span> <span>Muted</span></div>
        <div><span>Carol Williams</span></div>
        <div><span>You</span></div>
      </div>
      <nav aria-label="Call controls">
        <button aria-label="Toggle microphone">Mic</button>
        <button aria-label="Toggle camera">Camera</button>
        <button aria-label="Share screen">Share Screen</button>
        <button aria-label="Open chat">Chat</button>
        <button aria-label="End call">End Call</button>
      </nav>`),
    expected: [
      { type: "text", label: "Alice Johnson" },
      { type: "button", label: "microphone" },
      { type: "button", label: "camera" },
      { type: "button", label: "Share screen" },
      { type: "button", label: "End call" },
    ],
    minElements: 6,
  },
  {
    id: "comm-005", name: "Forum thread", category: "communication",
    html: page("Forum", `
      <h1>How to optimize database queries?</h1>
      <div>
        <span>Posted by Alice — 2 days ago</span>
        <span>Views: 234 — Replies: 5</span>
      </div>
      <article>
        <p>I'm having performance issues with my SQL queries. Any tips?</p>
        <div><button>Like (12)</button><button>Reply</button><button>Share</button></div>
      </article>
      <article>
        <h3>Bob replied:</h3>
        <p>Try adding indexes on your WHERE clause columns.</p>
        <div><button>Like (8)</button><button>Reply</button></div>
      </article>
      <article>
        <h3>Carol replied:</h3>
        <p>Use EXPLAIN to analyze your query plan first.</p>
        <div><button>Like (15)</button><button>Reply</button></div>
      </article>
      <div>
        <textarea placeholder="Write your reply..." aria-label="Reply"></textarea>
        <button>Post Reply</button>
      </div>`),
    expected: [
      { type: "text", label: "optimize database" },
      { type: "button", label: "Like" },
      { type: "button", label: "Reply" },
      { type: "button", label: "Post Reply" },
    ],
    minElements: 8,
  },
  {
    id: "comm-006", name: "Inbox with filters", category: "communication",
    html: page("Inbox", `
      <h1>Inbox (3 unread)</h1>
      <div>
        <input type="search" placeholder="Search mail..." aria-label="Search mail">
        <button>Compose</button>
      </div>
      <nav aria-label="Folders">
        <a href="#" aria-current="page">Inbox (3)</a>
        <a href="#">Sent</a>
        <a href="#">Drafts (1)</a>
        <a href="#">Spam</a>
        <a href="#">Trash</a>
      </nav>
      <div role="list" aria-label="Messages">
        <div role="listitem" aria-label="Unread">
          <input type="checkbox" aria-label="Select message">
          <strong>Alice Johnson</strong>
          <span>Project update — Here are the latest changes...</span>
          <time>10:30 AM</time>
        </div>
        <div role="listitem" aria-label="Unread">
          <input type="checkbox" aria-label="Select message">
          <strong>Bob Smith</strong>
          <span>Meeting tomorrow — Can we reschedule...</span>
          <time>9:15 AM</time>
        </div>
        <div role="listitem">
          <input type="checkbox" aria-label="Select message">
          <span>Carol Williams</span>
          <span>Code review feedback — Looks good overall...</span>
          <time>Yesterday</time>
        </div>
      </div>`),
    expected: [
      { type: "input", label: "Search mail" },
      { type: "button", label: "Compose" },
      { type: "link", label: "Inbox" },
      { type: "link", label: "Sent" },
      { type: "text", label: "Alice Johnson" },
    ],
    minElements: 10,
  },
  {
    id: "comm-007", name: "Calendar event creation", category: "communication",
    html: page("New Event", `
      <h1>Create Event</h1>
      <form>
        <label for="title">Event Title</label>
        <input id="title" type="text" placeholder="Add title" required>
        <label for="date">Date</label>
        <input id="date" type="date" required>
        <label for="stime">Start Time</label>
        <input id="stime" type="time" value="09:00">
        <label for="etime">End Time</label>
        <input id="etime" type="time" value="10:00">
        <label for="loc">Location</label>
        <input id="loc" type="text" placeholder="Add location">
        <label for="desc">Description</label>
        <textarea id="desc" rows="4" placeholder="Add description"></textarea>
        <label for="remind">Reminder</label>
        <select id="remind"><option>15 minutes</option><option>30 minutes</option><option>1 hour</option><option>1 day</option></select>
        <label><input type="checkbox"> Recurring event</label>
        <div>
          <button type="submit">Save Event</button>
          <button type="button">Cancel</button>
        </div>
      </form>`),
    expected: [
      { type: "input", label: "Event Title" },
      { type: "input", label: "Date" },
      { type: "input", label: "Start Time" },
      { type: "input", label: "Location" },
      { type: "button", label: "Save Event" },
      { type: "button", label: "Cancel" },
    ],
    minElements: 8,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 13: DEVELOPER TOOLS (7 scenarios)
// ═══════════════════════════════════════════════

const devtoolScenarios: Scenario[] = [
  {
    id: "dev-001", name: "API documentation", category: "devtools",
    html: page("API Docs", `
      <h1>API Documentation</h1>
      <nav aria-label="API sections">
        <a href="#">Authentication</a>
        <a href="#">Users</a>
        <a href="#">Products</a>
        <a href="#">Orders</a>
      </nav>
      <section>
        <h2>GET /api/users</h2>
        <p>Returns a list of all users.</p>
        <h3>Parameters</h3>
        <table aria-label="Parameters">
          <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td>page</td><td>integer</td><td>No</td><td>Page number</td></tr>
            <tr><td>limit</td><td>integer</td><td>No</td><td>Items per page</td></tr>
            <tr><td>search</td><td>string</td><td>No</td><td>Search query</td></tr>
          </tbody>
        </table>
        <button>Try it out</button>
      </section>`),
    expected: [
      { type: "link", label: "Authentication" },
      { type: "link", label: "Users" },
      { type: "text", label: "GET /api/users" },
      { type: "button", label: "Try it out" },
    ],
    minElements: 8,
  },
  {
    id: "dev-002", name: "CI/CD pipeline view", category: "devtools",
    html: page("Pipeline", `
      <h1>Pipeline #456 — main</h1>
      <p>Triggered by: Alice Johnson — Commit abc1234</p>
      <div role="list" aria-label="Pipeline stages">
        <div role="listitem">
          <h3>Build</h3><span>Passed — 2m 14s</span>
          <button>View Logs</button>
        </div>
        <div role="listitem">
          <h3>Test</h3><span>Passed — 5m 32s</span>
          <button>View Logs</button>
        </div>
        <div role="listitem">
          <h3>Deploy Staging</h3><span>Passed — 1m 45s</span>
          <button>View Logs</button>
        </div>
        <div role="listitem">
          <h3>Deploy Production</h3><span>Pending approval</span>
          <button>Approve</button>
          <button>Reject</button>
        </div>
      </div>
      <button>Retry Pipeline</button>
      <button>Cancel</button>`),
    expected: [
      { type: "text", label: "Pipeline #456" },
      { type: "text", label: "Build" },
      { type: "button", label: "View Logs" },
      { type: "button", label: "Approve" },
      { type: "button", label: "Retry Pipeline" },
    ],
    minElements: 8,
  },
  {
    id: "dev-003", name: "Git diff viewer", category: "devtools",
    html: page("Diff", `
      <h1>Pull Request #142 — Fix login validation</h1>
      <div>
        <span>2 files changed</span>
        <span>+24 -8</span>
        <button>Approve</button>
        <button>Request Changes</button>
        <button>Comment</button>
      </div>
      <div>
        <h3>src/auth/login.ts</h3>
        <pre>
- if (password.length > 0) {
+ if (password.length >= 8) {
    return validate(password);
  }
        </pre>
        <button>Add Comment</button>
      </div>
      <div>
        <h3>src/auth/login.test.ts</h3>
        <pre>
+ test('rejects short passwords', () => {
+   expect(validate('abc')).toBe(false);
+ });
        </pre>
        <button>Add Comment</button>
      </div>
      <div>
        <textarea placeholder="Leave a review comment..." aria-label="Review comment"></textarea>
        <button>Submit Review</button>
      </div>`),
    expected: [
      { type: "text", label: "Pull Request #142" },
      { type: "button", label: "Approve" },
      { type: "button", label: "Request Changes" },
      { type: "button", label: "Submit Review" },
    ],
    minElements: 6,
  },
  {
    id: "dev-004", name: "Issue tracker", category: "devtools",
    html: page("Issues", `
      <h1>Issues</h1>
      <div>
        <input type="search" placeholder="Search issues..." aria-label="Search issues">
        <button>New Issue</button>
      </div>
      <div>
        <label><input type="checkbox" checked> Open (23)</label>
        <label><input type="checkbox"> Closed (156)</label>
        <label for="label-filter">Label</label>
        <select id="label-filter"><option>All</option><option>Bug</option><option>Feature</option><option>Enhancement</option></select>
      </div>
      <div role="list" aria-label="Issues">
        <div role="listitem">
          <a href="#">#87: Performance regression in API</a>
          <span>Bug — High Priority</span>
          <span>Assigned to Bob — 3 days ago</span>
        </div>
        <div role="listitem">
          <a href="#">#86: Add dark mode support</a>
          <span>Feature — Medium Priority</span>
          <span>Assigned to Carol — 5 days ago</span>
        </div>
        <div role="listitem">
          <a href="#">#85: Update documentation</a>
          <span>Enhancement — Low Priority</span>
          <span>Unassigned — 1 week ago</span>
        </div>
      </div>`),
    expected: [
      { type: "input", label: "Search issues" },
      { type: "button", label: "New Issue" },
      { type: "link", label: "Performance regression" },
      { type: "link", label: "dark mode" },
    ],
    minElements: 8,
  },
  {
    id: "dev-005", name: "Package manager", category: "devtools",
    html: page("Packages", `
      <h1>Dependencies</h1>
      <div>
        <input type="search" placeholder="Search packages..." aria-label="Search packages">
        <button>Add Package</button>
      </div>
      <table aria-label="Installed packages">
        <thead><tr><th>Package</th><th>Version</th><th>Latest</th><th>License</th><th></th></tr></thead>
        <tbody>
          <tr><td>react</td><td>18.2.0</td><td>18.3.1</td><td>MIT</td><td><button>Update</button></td></tr>
          <tr><td>typescript</td><td>5.3.3</td><td>5.4.2</td><td>Apache-2.0</td><td><button>Update</button></td></tr>
          <tr><td>express</td><td>4.18.2</td><td>4.18.2</td><td>MIT</td><td><span>Up to date</span></td></tr>
          <tr><td>lodash</td><td>4.17.21</td><td>4.17.21</td><td>MIT</td><td><span>Up to date</span></td></tr>
        </tbody>
      </table>
      <button>Update All</button>`),
    expected: [
      { type: "input", label: "Search packages" },
      { type: "button", label: "Add Package" },
      { type: "text", label: "react" },
      { type: "text", label: "typescript" },
      { type: "button", label: "Update" },
    ],
    minElements: 10,
  },
  {
    id: "dev-006", name: "Terminal / console output", category: "devtools",
    html: page("Terminal", `
      <h1>Terminal</h1>
      <div role="log" aria-label="Terminal output" style="background:#1a1a2e;color:#e0e0e0;padding:15px;font-family:monospace">
        <p>$ npm run build</p>
        <p>Building project...</p>
        <p>Compiled 42 files in 3.2s</p>
        <p>$ npm test</p>
        <p>Running 128 tests...</p>
        <p>All tests passed.</p>
        <p>$ _</p>
      </div>
      <div>
        <input type="text" aria-label="Command input" placeholder="Enter command...">
        <button>Run</button>
        <button>Clear</button>
        <button>Copy Output</button>
      </div>`),
    expected: [
      { type: "text", label: "npm run build" },
      { type: "text", label: "Compiled 42 files" },
      { type: "input", label: "Command input" },
      { type: "button", label: "Run" },
      { type: "button", label: "Clear" },
    ],
    minElements: 6,
  },
  {
    id: "dev-007", name: "Database query interface", category: "devtools",
    html: page("SQL Editor", `
      <h1>Database Explorer</h1>
      <nav aria-label="Tables">
        <a href="#">users</a>
        <a href="#">orders</a>
        <a href="#">products</a>
        <a href="#">sessions</a>
      </nav>
      <div>
        <label for="query">SQL Query</label>
        <textarea id="query" rows="5" aria-label="SQL query editor">SELECT * FROM users LIMIT 10;</textarea>
        <button>Execute</button>
        <button>Format</button>
        <button>Save Query</button>
      </div>
      <table aria-label="Query results">
        <thead><tr><th>id</th><th>name</th><th>email</th><th>created_at</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>Alice</td><td>alice@test.com</td><td>2026-01-15</td></tr>
          <tr><td>2</td><td>Bob</td><td>bob@test.com</td><td>2026-02-20</td></tr>
          <tr><td>3</td><td>Carol</td><td>carol@test.com</td><td>2026-03-01</td></tr>
        </tbody>
      </table>
      <p>3 rows returned in 0.042s</p>`),
    expected: [
      { type: "link", label: "users" },
      { type: "link", label: "orders" },
      { type: "button", label: "Execute" },
      { type: "button", label: "Format" },
      { type: "text", label: "Alice" },
    ],
    minElements: 10,
  },
];

// ═══════════════════════════════════════════════
// CATEGORY 14: FINANCIAL & BUSINESS (6 scenarios)
// ═══════════════════════════════════════════════

const financeScenarios: Scenario[] = [
  {
    id: "fin-001", name: "Invoice form", category: "finance",
    html: page("Invoice", `
      <h1>Create Invoice</h1>
      <form>
        <label for="client">Client Name</label>
        <input id="client" type="text" required>
        <label for="inv-num">Invoice Number</label>
        <input id="inv-num" type="text" value="INV-2026-001" readonly>
        <label for="due">Due Date</label>
        <input id="due" type="date" required>
        <h2>Line Items</h2>
        <table aria-label="Line items">
          <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
          <tbody>
            <tr>
              <td><input type="text" value="Consulting Services" aria-label="Description"></td>
              <td><input type="number" value="10" aria-label="Quantity"></td>
              <td><input type="number" value="150" aria-label="Unit price"></td>
              <td>$1,500.00</td>
              <td><button>Remove</button></td>
            </tr>
            <tr>
              <td><input type="text" value="Travel Expenses" aria-label="Description"></td>
              <td><input type="number" value="1" aria-label="Quantity"></td>
              <td><input type="number" value="250" aria-label="Unit price"></td>
              <td>$250.00</td>
              <td><button>Remove</button></td>
            </tr>
          </tbody>
        </table>
        <button type="button">Add Line Item</button>
        <div>
          <p>Subtotal: $1,750.00</p>
          <p>Tax (10%): $175.00</p>
          <p><strong>Total: $1,925.00</strong></p>
        </div>
        <button type="submit">Send Invoice</button>
        <button type="button">Save as Draft</button>
        <button type="button">Preview</button>
      </form>`),
    expected: [
      { type: "input", label: "Client Name" },
      { type: "input", label: "Invoice Number" },
      { type: "button", label: "Add Line Item" },
      { type: "button", label: "Send Invoice" },
      { type: "button", label: "Save as Draft" },
    ],
    minElements: 12,
  },
  {
    id: "fin-002", name: "Transaction history", category: "finance",
    html: page("Transactions", `
      <h1>Transaction History</h1>
      <div>
        <label for="period">Period</label>
        <select id="period"><option>Last 7 days</option><option selected>Last 30 days</option><option>Last 90 days</option><option>Custom</option></select>
        <label for="type">Type</label>
        <select id="type"><option>All</option><option>Income</option><option>Expense</option></select>
        <input type="search" placeholder="Search transactions..." aria-label="Search transactions">
      </div>
      <table aria-label="Transactions">
        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>Mar 15</td><td>Client Payment — Acme Corp</td><td>Income</td><td>+$5,000.00</td></tr>
          <tr><td>Mar 14</td><td>AWS Services</td><td>Infrastructure</td><td>-$342.18</td></tr>
          <tr><td>Mar 12</td><td>Office Supplies</td><td>Expenses</td><td>-$89.50</td></tr>
          <tr><td>Mar 10</td><td>Client Payment — Beta Inc</td><td>Income</td><td>+$3,200.00</td></tr>
        </tbody>
      </table>
      <p>Balance: $12,456.32</p>
      <button>Export</button>`),
    expected: [
      { type: "input", label: "Search transactions" },
      { type: "text", label: "Acme Corp" },
      { type: "text", label: "AWS Services" },
      { type: "button", label: "Export" },
    ],
    minElements: 10,
  },
  {
    id: "fin-003", name: "Budget planner", category: "finance",
    html: page("Budget", `
      <h1>Monthly Budget — March 2026</h1>
      <div role="region" aria-label="Budget summary">
        <div><h3>Income</h3><span>$8,500.00</span></div>
        <div><h3>Expenses</h3><span>$6,234.00</span></div>
        <div><h3>Remaining</h3><span>$2,266.00</span></div>
      </div>
      <table aria-label="Budget categories">
        <thead><tr><th>Category</th><th>Budgeted</th><th>Spent</th><th>Remaining</th></tr></thead>
        <tbody>
          <tr><td>Housing</td><td>$2,000</td><td>$2,000</td><td>$0</td></tr>
          <tr><td>Food</td><td>$600</td><td>$452</td><td>$148</td></tr>
          <tr><td>Transport</td><td>$300</td><td>$275</td><td>$25</td></tr>
          <tr><td>Utilities</td><td>$200</td><td>$187</td><td>$13</td></tr>
          <tr><td>Entertainment</td><td>$150</td><td>$120</td><td>$30</td></tr>
        </tbody>
      </table>
      <button>Edit Budget</button>
      <button>Add Category</button>`),
    expected: [
      { type: "text", label: "Income" },
      { type: "text", label: "Expenses" },
      { type: "text", label: "Housing" },
      { type: "button", label: "Edit Budget" },
      { type: "button", label: "Add Category" },
    ],
    minElements: 10,
  },
  {
    id: "fin-004", name: "Payment form", category: "finance",
    html: page("Payment", `
      <h1>Make a Payment</h1>
      <form>
        <h2>Payment Method</h2>
        <label><input type="radio" name="method" checked> Credit Card</label>
        <label><input type="radio" name="method"> Bank Transfer</label>
        <label><input type="radio" name="method"> PayPal</label>
        <div>
          <label for="card">Card Number</label>
          <input id="card" type="text" placeholder="1234 5678 9012 3456" maxlength="19">
          <label for="exp">Expiry</label>
          <input id="exp" type="text" placeholder="MM/YY">
          <label for="cvv">CVV</label>
          <input id="cvv" type="text" placeholder="123" maxlength="4">
          <label for="name-card">Name on Card</label>
          <input id="name-card" type="text" placeholder="John Doe">
        </div>
        <div>
          <p>Amount: $1,925.00</p>
          <label><input type="checkbox"> Save payment method for future use</label>
        </div>
        <button type="submit">Pay $1,925.00</button>
        <button type="button">Cancel</button>
      </form>`),
    expected: [
      { type: "radio_button", label: "Credit Card" },
      { type: "radio_button", label: "Bank Transfer" },
      { type: "input", label: "Card Number" },
      { type: "input", label: "Expiry" },
      { type: "button", label: "Pay" },
    ],
    minElements: 8,
  },
  {
    id: "fin-005", name: "Report generator", category: "finance",
    html: page("Reports", `
      <h1>Generate Report</h1>
      <form>
        <label for="rtype">Report Type</label>
        <select id="rtype">
          <option>Profit & Loss</option>
          <option>Balance Sheet</option>
          <option>Cash Flow</option>
          <option>Tax Summary</option>
        </select>
        <label for="from">From Date</label>
        <input id="from" type="date" value="2026-01-01">
        <label for="to">To Date</label>
        <input id="to" type="date" value="2026-03-15">
        <label for="fmt">Format</label>
        <select id="fmt"><option>PDF</option><option>Excel</option><option>CSV</option></select>
        <label><input type="checkbox" checked> Include charts</label>
        <label><input type="checkbox"> Compare with previous period</label>
        <button type="submit">Generate Report</button>
        <button type="button">Schedule</button>
      </form>`),
    expected: [
      { type: "text", label: "Report Type" },
      { type: "input", label: "From Date" },
      { type: "input", label: "To Date" },
      { type: "button", label: "Generate Report" },
      { type: "button", label: "Schedule" },
    ],
    minElements: 6,
  },
  {
    id: "fin-006", name: "Expense approval workflow", category: "finance",
    html: page("Approvals", `
      <h1>Pending Approvals</h1>
      <div role="list" aria-label="Pending expense approvals">
        <article role="listitem">
          <h3>Travel Expense — Alice Johnson</h3>
          <p>Amount: $1,234.56 — Category: Travel</p>
          <p>Description: Client site visit to Acme Corp</p>
          <button>Approve</button>
          <button>Reject</button>
          <button>Request Info</button>
        </article>
        <article role="listitem">
          <h3>Software License — Bob Smith</h3>
          <p>Amount: $499.00 — Category: Software</p>
          <p>Description: Annual IDE license renewal</p>
          <button>Approve</button>
          <button>Reject</button>
          <button>Request Info</button>
        </article>
      </div>
      <p>2 pending, 15 approved this month</p>`),
    expected: [
      { type: "text", label: "Travel Expense" },
      { type: "text", label: "Software License" },
      { type: "button", label: "Approve" },
      { type: "button", label: "Reject" },
      { type: "button", label: "Request Info" },
    ],
    minElements: 8,
  },
];

// ═══════════════════════════════════════════════
// Combine all scenarios
// ═══════════════════════════════════════════════

export const ALL_SCENARIOS: Scenario[] = [
  ...formScenarios,
  ...navScenarios,
  ...dataScenarios,
  ...interactiveScenarios,
  ...appScenarios,
  ...a11yScenarios,
  ...edgeScenarios,
  ...mediaScenarios,
  ...settingsScenarios,
  ...dashboardScenarios,
  ...ecommerceScenarios,
  ...communicationScenarios,
  ...devtoolScenarios,
  ...financeScenarios,
];

// Report total
if (require.main === module) {
  console.log(`Total scenarios: ${ALL_SCENARIOS.length}`);
  const byCategory: Record<string, number> = {};
  for (const s of ALL_SCENARIOS) {
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }
}
