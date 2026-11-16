import { $ } from '../lib/dom.js';
import { signIn } from '../db.js';

export function render(view) {
  view.innerHTML = `
    <div class="login">
      <div class="logo">🍲</div>
      <h1>Our Recipes</h1>
      <p class="muted">Sign in to see your shared recipes.</p>
      <form id="f">
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username" autocapitalize="off" required>
        <label for="pw">Password</label>
        <input id="pw" type="password" autocomplete="current-password" required>
        <button class="primary block" type="submit">Sign in</button>
        <div class="err" id="err"></div>
      </form>
    </div>`;
  $('#f', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', view);
    btn.disabled = true;
    $('#err', view).textContent = '';
    try {
      await signIn($('#email', view).value.trim(), $('#pw', view).value);
    } catch (err) {
      $('#err', view).textContent = /invalid/i.test(err.message)
        ? 'That email or password is not right.' : err.message;
      btn.disabled = false;
    }
  });
}
