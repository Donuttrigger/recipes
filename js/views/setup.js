// Shown only if js/config.js hasn't been filled in yet.
export function render(view) {
  view.innerHTML = `
    <div class="login">
      <div class="logo">🔌</div>
      <h1>Almost ready</h1>
      <p class="muted">This app isn't connected to its database yet.
      Add your Supabase address and key to <code>js/config.js</code> (see SETUP.md).</p>
    </div>`;
}
