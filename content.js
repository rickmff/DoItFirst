/**
 * doitfirst - A Chrome extension combining todo list and timer functionality
 * Features:
 * - Todo list management
 * - Configurable Pomodoro-style timer
 * - Modal interface for focused task management
 * - Persistent settings and data storage
 * - Responsive UI with custom styling
 * - Multi-platform support for Twitter/X, YouTube, Instagram, and TikTok
 */
const DEFAULT_OPTIONS = {
  alwaysShowModal: true,
  clearTodosDaily: false,
  timerDuration: 25 * 60, // 25 minutes in seconds
  hideShorts: true,
  hideHomeFeed: true,
  hideRecommendations: true,
  enabledPlatforms: {
    twitter: true,
    youtube: true,
    instagram: true,
    tiktok: true
  }
};

// A longer gap between ticks means the computer was asleep, not that time was spent here
const MAX_TICK_SECONDS = 120;

class DoItFirst {
  constructor() {
    this.todos = [];
    this.modalActive = true;
    this.options = { ...DEFAULT_OPTIONS };
    this.timer = null;
    this.remainingTime = this.options.timerDuration;
    this.lastTimerUpdate = null; // Track when the timer was last updated
    this.sessionUpdatedAt = 0; // When any tab on this site last spent time
    this.newTaskSince = null; // Set when a session ends: only a task created after this unlocks the next one
    this.hideCompleted = false; // Add this line to track completed tasks visibility
    this.currentPlatform = this.detectPlatform();
  }

  /**
   * Platform Detection
   * Detects which social media platform the user is currently on
   */
  detectPlatform() {
    const url = window.location.hostname;
    
    if (url.includes('twitter.com') || url.includes('x.com')) {
      return 'twitter';
    } else if (url.includes('youtube.com')) {
      return 'youtube';
    } else if (url.includes('instagram.com')) {
      return 'instagram';
    } else if (url.includes('tiktok.com')) {
      return 'tiktok';
    }
    
    return null;
  }

  /**
   * Settings Management
   * Loads user preferences and todos together, so nothing runs on defaults
   */
  loadState(callback) {
    chrome.storage.sync.get({ ...DEFAULT_OPTIONS, todos: [] }, (items) => {
      const { todos, ...options } = items;

      this.todos = todos;
      this.options = {
        ...options,
        enabledPlatforms: { ...DEFAULT_OPTIONS.enabledPlatforms, ...options.enabledPlatforms }
      };
      this.remainingTime = this.options.timerDuration;

      // If clearTodosDaily is enabled, check if we need to clear todos
      if (this.options.clearTodosDaily) {
        this.checkDailyClear();
      }

      this.loadSession(callback);
    });
  }

  /**
   * Session Persistence
   * Keeps the time left per site, so reloading or opening a new tab doesn't refill it.
   * Uses storage.local because it's written every second, too often for storage.sync.
   */
  sessionKey() {
    return `session:${this.currentPlatform}`;
  }

  loadSession(callback) {
    const key = this.sessionKey();

    chrome.storage.local.get([key], (items) => {
      const session = items[key];

      if (session) {
        this.newTaskSince = session.newTaskSince;
        this.sessionUpdatedAt = session.updatedAt || 0;

        // Time left over from an earlier day doesn't carry over
        if (session.day === new Date().toDateString()) {
          this.remainingTime = Math.min(session.remainingTime, this.options.timerDuration);
        }
      }

      callback();
    });
  }

  saveSession() {
    chrome.storage.local.set({
      [this.sessionKey()]: {
        remainingTime: this.remainingTime,
        newTaskSince: this.newTaskSince,
        updatedAt: this.lastTimerUpdate,
        day: new Date().toDateString()
      }
    });
  }

  /**
   * Todo Management - Daily Cleanup
   * Clears completed todos if enabled in settings
   */
  checkDailyClear() {
    const today = new Date().toDateString();
    
    chrome.storage.sync.get(['lastClearDate'], (result) => {
      if (!result.lastClearDate || result.lastClearDate !== today) {
        // Clear completed todos
        this.todos = this.todos.filter(todo => !todo.completed);
        this.saveTodos();
        this.renderTodos();

        // Update last clear date
        chrome.storage.sync.set({ lastClearDate: today });
      }
    });
  }

  /**
   * Core Initialization
   * Sets up the extension's UI and event handlers
   */
  initialize() {
    this.loadState(() => this.start());
  }

  start() {
    // Check if the current platform is enabled
    if (!this.options.enabledPlatforms[this.currentPlatform]) {
      console.log(`DoItFirst: ${this.currentPlatform} is disabled in settings`);
      return;
    }

    // Registered once here: createModal runs again every time the timer ends
    window.addEventListener('keydown', this.handleKeydown, true);
    document.addEventListener('play', this.handleMediaPlay, true);

    // Check if we should show the modal
    chrome.storage.sync.get(['modalShownToday'], (result) => {
      const today = new Date().toDateString();
      const modalShownToday = result.modalShownToday === today;
      
      // Create footer and UI elements regardless of modal state
      this.createFooter();
      
      // Only show modal if alwaysShowModal is true or if it hasn't been shown today
      if (this.options.alwaysShowModal || !modalShownToday || this.newTaskSince) {
        // Wait for the page to load
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            this.createModal();
          });
        } else {
          this.createModal();
        }
        
        // Mark that we've shown the modal today
        chrome.storage.sync.set({ modalShownToday: today });
      } else {
        // If we're not showing the modal, start the timer immediately
        this.modalActive = false;
        this.startTimer();
        
        // Make sure the timer is visible
        const timerDisplay = document.getElementById('doitfirst-timer');
        if (timerDisplay) {
          timerDisplay.classList.add('visible');
        }
      }
      
      // Ensure reset button is hidden initially
      const resetBtn = document.getElementById('doitfirst-reset-btn');
      if (resetBtn && !this.timer) {
        resetBtn.classList.add('doitfirst-hidden');
      }
    });
    
    // Add event listener for page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.modalActive) {
        // Page is visible again and modal is not active
        // Pick up the time left, which another tab on this site may have used
        this.loadSession(() => {
          if (this.newTaskSince) {
            this.showTimeUpModal();
          } else {
            this.startTimer();
          }
        });
      }
    });
  }

  /**
   * UI Components - Footer and Controls
   * Creates the persistent footer and floating control buttons
   */
  createFooter() {
    // Check if footer already exists
    if (!document.getElementById('doitfirst-footer')) {
      const footer = document.createElement('div');
      footer.id = 'doitfirst-footer';
      footer.classList.add('doitfirst-element');
      footer.innerHTML = `<a href="https://github.com/rickmff" target="_blank">Made by rickmff</a>`;
      document.body.appendChild(footer);
    }
    
    // Create floating buttons if they don't exist
    if (!document.getElementById('doitfirst-floating-buttons')) {
      const floatingButtons = document.createElement('div');
      floatingButtons.id = 'doitfirst-floating-buttons';
      floatingButtons.classList.add('doitfirst-element');
      
      // Settings button
      const settingsBtn = document.createElement('button');
      settingsBtn.id = 'doitfirst-settings-btn';
      settingsBtn.setAttribute('aria-label', 'Settings');
      settingsBtn.classList.add('left-aligned');
      settingsBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7.07095 0.650238C6.67391 0.650238 6.32977 0.925096 6.24198 1.31231L6.0039 2.36247C5.6249 2.47269 5.26335 2.62363 4.92436 2.81013L4.01335 2.23585C3.67748 2.02413 3.23978 2.07312 2.95903 2.35386L2.35294 2.95996C2.0722 3.2407 2.0232 3.6784 2.23493 4.01427L2.80942 4.92561C2.62307 5.2645 2.47227 5.62594 2.36216 6.00481L1.31209 6.24287C0.924883 6.33065 0.650024 6.6748 0.650024 7.07183V7.92897C0.650024 8.32601 0.924883 8.67015 1.31209 8.75794L2.36228 8.99603C2.47246 9.375 2.62335 9.73652 2.80979 10.0755L2.2354 10.9867C2.02367 11.3225 2.07267 11.7602 2.35341 12.041L2.95951 12.6471C3.24025 12.9278 3.67795 12.9768 4.01382 12.7651L4.92506 12.1907C5.26384 12.377 5.62516 12.5278 6.0039 12.6379L6.24198 13.6881C6.32977 14.0753 6.67391 14.3502 7.07095 14.3502H7.92809C8.32512 14.3502 8.66927 14.0753 8.75705 13.6881L8.99505 12.6383C9.37411 12.5282 9.73573 12.3773 10.0748 12.1909L10.986 12.7653C11.3218 12.977 11.7595 12.928 12.0403 12.6473L12.6464 12.0412C12.9271 11.7604 12.9761 11.3227 12.7644 10.9869L12.1902 10.076C12.3768 9.73688 12.5278 9.37515 12.638 8.99596L13.6879 8.75794C14.0751 8.67015 14.35 8.32601 14.35 7.92897V7.07183C14.35 6.6748 14.0751 6.33065 13.6879 6.24287L12.6381 6.00488C12.528 5.62578 12.3771 5.26414 12.1906 4.92507L12.7648 4.01407C12.9766 3.6782 12.9276 3.2405 12.6468 2.95975L12.0407 2.35366C11.76 2.07292 11.3223 2.02392 10.9864 2.23565L10.0755 2.80989C9.73622 2.62328 9.37437 2.47229 8.99505 2.36209L8.75705 1.31231C8.66927 0.925096 8.32512 0.650238 7.92809 0.650238H7.07095ZM4.92053 3.81251C5.44724 3.44339 6.05665 3.18424 6.71543 3.06839L7.07095 1.50024H7.92809L8.28355 3.06816C8.94267 3.18387 9.5524 3.44302 10.0794 3.81224L11.4397 2.9547L12.0458 3.56079L11.1887 4.92117C11.558 5.44798 11.8173 6.0575 11.9332 6.71638L13.5 7.07183V7.92897L11.9334 8.28444C11.8176 8.94342 11.5586 9.55301 11.1892 10.0798L12.0459 11.4394L11.4398 12.0455L10.0797 11.1889C9.55252 11.5583 8.94242 11.8177 8.28355 11.9336L7.92809 13.5002H7.07095L6.71543 11.9332C6.0569 11.8174 5.44772 11.5582 4.92116 11.189L3.56055 12.0455L2.95445 11.4394L3.81107 10.0794C3.4416 9.55266 3.18222 8.94283 3.06635 8.28355L1.50002 7.92897V7.07183L3.06613 6.71632C3.18186 6.05765 3.44098 5.44833 3.81015 4.92165L2.95398 3.56103L3.56008 2.95493L4.92053 3.81251ZM9.02496 7.50008C9.02496 8.32849 8.35338 9.00008 7.52496 9.00008C6.69655 9.00008 6.02496 8.32849 6.02496 7.50008C6.02496 6.67167 6.69655 6.00008 7.52496 6.00008C8.35338 6.00008 9.02496 6.67167 9.02496 7.50008ZM10.025 7.50008C10.025 8.8808 8.90568 10.0001 7.52496 10.0001C6.14425 10.0001 5.02496 8.8808 5.02496 7.50008C5.02496 6.11937 6.14425 5.00008 7.52496 5.00008C8.90568 5.00008 10.025 6.11937 10.025 7.50008Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
        </svg>
      `;
      
      // Reset button
      const resetBtn = document.createElement('button');
      resetBtn.id = 'doitfirst-reset-btn';
      resetBtn.setAttribute('aria-label', 'Reset Timer & Show Modal');
      resetBtn.classList.add('right-aligned');
      resetBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1.90321 7.29344C1.90321 10.7749 4.7249 13.5966 8.20641 13.5966C11.6879 13.5966 14.5096 10.7749 14.5096 7.29344C14.5096 3.81193 11.6879 0.99023 8.20641 0.99023C6.72171 0.99023 5.37356 1.55121 4.33702 2.45883L4.83825 2.95358C5.76423 2.09575 6.92981 1.56273 8.20641 1.56273C11.3736 1.56273 13.937 4.12618 13.937 7.29344C13.937 10.4607 11.3736 13.0241 8.20641 13.0241C5.03915 13.0241 2.47571 10.4607 2.47571 7.29344C2.47571 6.92962 2.51424 6.5772 2.58601 6.23907L2.04453 6.35767C1.9983 6.66075 1.90321 6.96834 1.90321 7.29344ZM8.20641 4.25258C8.20641 4.25258 8.20641 3.66905 8.20641 3.66905C8.20641 3.36709 8.45359 3.11992 8.75555 3.11992C9.05751 3.11992 9.30468 3.36709 9.30468 3.66905C9.30468 3.66905 9.30468 5.35156 9.30468 5.35156C9.30468 5.35156 10.4466 5.35156 10.4466 5.35156C10.7486 5.35156 10.9957 5.59873 10.9957 5.90069C10.9957 6.20265 10.7486 6.44982 10.4466 6.44982C10.4466 6.44982 8.75555 6.44982 8.75555 6.44982C8.45359 6.44982 8.20641 6.20265 8.20641 5.90069C8.20641 5.90069 8.20641 4.25258 8.20641 4.25258ZM5.9687 1.67772C5.9687 1.67772 0.5 1.67772 0.5 1.67772C0.5 1.67772 0.5 0.0296028 0.5 0.0296028C0.5 0.0296028 5.9687 0.0296028 5.9687 0.0296028C5.9687 0.0296028 5.9687 1.67772 5.9687 1.67772Z" fill="currentColor"/>
        </svg>
      `;
      // Initially hide the reset button
      resetBtn.classList.add('doitfirst-hidden');
      
      floatingButtons.appendChild(settingsBtn);
      floatingButtons.appendChild(resetBtn);
      
      // Create settings panel
      const settingsPanel = document.createElement('div');
      settingsPanel.id = 'doitfirst-settings-panel';
      settingsPanel.classList.add('doitfirst-element', 'settings-panel');
      settingsPanel.innerHTML = `
        <div class="settings-content">
          <div class="setting-group">
            <label for="timer-duration">Timer Duration</label>
            <div class="timer-input-wrapper">
              <button class="timer-adjust-btn" id="decrease-timer" aria-label="Decrease timer by 5 minutes">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.25 7.5C2.25 7.22386 2.47386 7 2.75 7H12.25C12.5261 7 12.75 7.22386 12.75 7.5C12.75 7.77614 12.5261 8 12.25 8H2.75C2.47386 8 2.25 7.77614 2.25 7.5Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
                </svg>
              </button>
              <div class="timer-display">
                <input type="number" 
                  id="timer-duration" 
                  min="5" 
                  max="120" 
                  step="5" 
                  value="${this.options.timerDuration / 60}"
                  aria-label="Timer duration in minutes"
                >
              </div>
              <button class="timer-adjust-btn" id="increase-timer" aria-label="Increase timer by 5 minutes">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2.75C8 2.47386 7.77614 2.25 7.5 2.25C7.22386 2.25 7 2.47386 7 2.75V7H2.75C2.47386 7 2.25 7.22386 2.25 7.5C2.25 7.77614 2.47386 8 2.75 8H7V12.25C7 12.5261 7.22386 12.75 7.5 12.75C7.77614 12.75 8 12.5261 8 12.25V8H12.25C12.5261 8 12.75 7.77614 12.75 7.5C12.75 7.22386 12.5261 7 12.25 7H8V2.75Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="setting-group">
            <label class="checkbox-label">
              <input type="checkbox" id="always-show-modal" ${this.options.alwaysShowModal ? 'checked' : ''}>
              Always show modal when visiting this site
            </label>
          </div>
          <div class="setting-group">
            <label class="checkbox-label">
              <input type="checkbox" id="clear-todos-daily" ${this.options.clearTodosDaily ? 'checked' : ''}>
              Clear completed todos daily
            </label>
          </div>
          ${this.currentPlatform === 'youtube' ? `
          <div class="setting-group">
            <label class="checkbox-label">
              <input type="checkbox" id="hide-shorts" ${this.options.hideShorts ? 'checked' : ''}>
              Hide YouTube Shorts
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="hide-home-feed" ${this.options.hideHomeFeed ? 'checked' : ''}>
              Hide home feed
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="hide-recommendations" ${this.options.hideRecommendations ? 'checked' : ''}>
              Hide recommended videos
            </label>
          </div>
          ` : ''}
          <div class="settings-btn-container">
            <button id="save-settings" class="save-settings-btn">Save Settings</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(settingsPanel);
      document.body.appendChild(floatingButtons);
      
      // Create timer display
      const timerDisplay = document.createElement('div');
      timerDisplay.id = 'doitfirst-timer';
      timerDisplay.classList.add('doitfirst-element', 'left-aligned');
      timerDisplay.innerHTML = this.formatTime(this.remainingTime);
      document.body.appendChild(timerDisplay);
      
      // Add event listeners for the buttons
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const settingsPanel = document.getElementById('doitfirst-settings-panel');
        
        if (settingsPanel) {
          const isVisible = settingsPanel.classList.contains('visible');
          
          if (isVisible) {
            this.hideSettingsPanel(settingsPanel);
          } else {
            this.showSettingsPanel(settingsPanel, settingsBtn);
          }
        }
      });
      
      resetBtn.addEventListener('click', () => {
        this.resetTimerAndShowModal();
      });
      
      // Add event listeners for timer adjustment buttons
      const decreaseTimerBtn = document.getElementById('decrease-timer');
      const increaseTimerBtn = document.getElementById('increase-timer');
      const timerDurationInput = document.getElementById('timer-duration');
      
      if (decreaseTimerBtn && timerDurationInput) {
        decreaseTimerBtn.addEventListener('click', () => {
          const currentValue = parseInt(timerDurationInput.value);
          if (currentValue > 5) {
            timerDurationInput.value = Math.max(5, currentValue - 5);
          }
        });
      }
      
      if (increaseTimerBtn && timerDurationInput) {
        increaseTimerBtn.addEventListener('click', () => {
          const currentValue = parseInt(timerDurationInput.value);
          if (currentValue < 120) {
            timerDurationInput.value = Math.min(120, currentValue + 5);
          }
        });
      }

      if (timerDurationInput) {
        timerDurationInput.addEventListener('change', () => {
          let value = parseInt(timerDurationInput.value);
          // Round to nearest 5
          value = Math.round(value / 5) * 5;
          // Clamp between 5 and 120
          value = Math.max(5, Math.min(120, value));
          timerDurationInput.value = value;
        });
      }
      
      // Add event listeners for save settings button
      document.getElementById('save-settings').addEventListener('click', () => {
        const changes = {
          timerDuration: parseInt(document.getElementById('timer-duration').value) * 60,
          alwaysShowModal: document.getElementById('always-show-modal').checked,
          clearTodosDaily: document.getElementById('clear-todos-daily').checked
        };

        // These only exist in the panel on YouTube
        if (this.currentPlatform === 'youtube') {
          changes.hideShorts = document.getElementById('hide-shorts').checked;
          changes.hideHomeFeed = document.getElementById('hide-home-feed').checked;
          changes.hideRecommendations = document.getElementById('hide-recommendations').checked;
        }

        // Changing the duration never adds time to a session already in progress
        const sessionStarted = this.remainingTime < this.options.timerDuration;

        this.options = { ...this.options, ...changes };
        this.remainingTime = sessionStarted
          ? Math.min(this.remainingTime, changes.timerDuration)
          : changes.timerDuration;
        this.saveSession();

        chrome.storage.sync.set(changes, () => {
          this.updateTimerDisplay();
          // Close the settings panel after saving
          const settingsPanel = document.getElementById('doitfirst-settings-panel');
          if (settingsPanel) {
            this.hideSettingsPanel(settingsPanel);
          }
        });
      });
    }
  }

  /**
   * UI Components - Modal
   * Creates the main modal interface for todo management
   */
  createModal() {
    if (document.getElementById('doitfirst-modal')) {
      return;
    }

    this.pauseMedia();

    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'doitfirst-modal';
    modal.classList.add('doitfirst-element');
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.id = 'doitfirst-modal-content';
    modalContent.classList.add('doitfirst-element');
    
    // Add header
    modalContent.innerHTML = `
      <h1>Do it first</h1>
      <p class="subtitle">Complete all tasks to continue</p>
    `;
    
    // Create todo input area
    const todoInputArea = document.createElement('div');
    todoInputArea.id = 'todo-input-area';
    todoInputArea.innerHTML = `
      <div class="input-wrapper">
        <input type="text" id="new-todo" placeholder="What needs to be done?">
        <button id="add-todo-btn" aria-label="Add task">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 2.75C8 2.47386 7.77614 2.25 7.5 2.25C7.22386 2.25 7 2.47386 7 2.75V7H2.75C2.47386 7 2.25 7.22386 2.25 7.5C2.25 7.77614 2.47386 8 2.75 8H7V12.25C7 12.5261 7.22386 12.75 7.5 12.75C7.77614 12.75 8 12.5261 8 12.25V8H12.25C12.5261 8 12.75 7.77614 12.75 7.5C12.75 7.22386 12.5261 7 12.25 7H8V2.75Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    `;
    
    // Create todo list
    const todoList = document.createElement('ul');
    todoList.id = 'todo-list';
    todoList.setAttribute('tabindex', '-1');
    
    // Create todo stats and actions container
    const todoStatsAndActions = document.createElement('div');
    todoStatsAndActions.id = 'todo-stats-actions';
    todoStatsAndActions.innerHTML = `
      <div id="todo-actions">
        <div id="todo-actions-left">
          <button id="toggle-completed" aria-label="Toggle completed tasks visibility">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.7649 6.07596C14.9991 6.22231 15.0703 6.53079 14.924 6.76495L10.924 12.765C10.8997 12.8026 10.8716 12.8368 10.8401 12.8671C10.6225 13.0895 10.2775 13.0895 10.0599 12.8671L7.55994 10.2671C7.34232 10.0495 7.34232 9.70448 7.55994 9.48686C7.77757 9.26924 8.12261 9.26924 8.34023 9.48686L10.4499 11.6766L14.074 6.235C14.2203 6.00079 14.5288 5.92961 14.7649 6.07596ZM7.92003 6.07596C8.15424 6.22231 8.22542 6.53079 8.07907 6.76495L4.07907 12.765C4.05478 12.8026 4.02667 12.8368 3.99517 12.8671C3.77755 13.0895 3.43251 13.0895 3.21489 12.8671L0.714886 10.2671C0.497262 10.0495 0.497262 9.70448 0.714886 9.48686C0.93251 9.26924 1.27755 9.26924 1.49517 9.48686L3.60485 11.6766L7.22907 6.235C7.37542 6.00079 7.68389 5.92961 7.92003 6.07596Z" fill="currentColor"/>
            </svg>
          </button>
          <button id="clear-completed" aria-label="Clear completed tasks">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H3.5C3.22386 4 3 3.77614 3 3.5ZM3.81825 5H11.1818L10.4429 12.8943C10.3728 13.5919 9.78696 14.1346 9.08322 14.1346H5.91679C5.21305 14.1346 4.62719 13.5919 4.55711 12.8943L3.81825 5ZM5.80113 6C5.52499 6 5.30248 6.22386 5.30248 6.5C5.30248 6.77614 5.52499 7 5.80113 7V11.5C5.80113 11.7761 6.02499 12 6.30113 12C6.57727 12 6.80113 11.7761 6.80113 11.5V7C6.80113 6.72386 6.57727 6.5 6.30113 6.5H5.80113ZM8.30113 6C8.02499 6 7.80113 6.22386 7.80113 6.5C7.80113 6.77614 8.02499 7 8.30113 7V11.5C8.30113 11.7761 8.52499 12 8.80113 12C9.07727 12 9.30113 11.7761 9.30113 11.5V7C9.30113 6.72386 9.07727 6.5 8.80113 6.5H8.30113Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
            </svg>
          </button>
        </div>
        <button id="continue-procrastinate" disabled aria-label="Continue">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
          </svg>
          <span id="continue-info">Complete all tasks to continue</span>
        </button>
      </div>
    `;
    
    // Append all elements to modal content
    modalContent.appendChild(todoInputArea);
    modalContent.appendChild(todoList);
    modalContent.appendChild(todoStatsAndActions);
    
    // Append modal content to modal
    modal.appendChild(modalContent);
    
    // Append modal to body
    document.body.appendChild(modal);
    
    // Make sure floating buttons are visible when modal is active
    const floatingButtons = document.getElementById('doitfirst-floating-buttons');
    if (floatingButtons) {
      floatingButtons.classList.add('visible');
      // Remove any inline styles that might be hiding the buttons
      floatingButtons.style.transform = '';
      floatingButtons.style.opacity = '';
      floatingButtons.style.transition = '';
      floatingButtons.style.display = '';
    }
    
    // Make sure footer is visible when modal is active
    const footer = document.getElementById('doitfirst-footer');
    if (footer) {
      footer.classList.add('visible');
    }
    
    // Set modal active flag
    this.modalActive = true;
    
    // Render todos
    this.renderTodos();
    
    // Update continue button
    this.updateContinueButton();
    
    // Attach event listeners
    this.attachEventListeners();
    
    // Focus the input field
    const newTodoInput = document.getElementById('new-todo');
    if (newTodoInput) {
      newTodoInput.focus();
    }
  }

  /**
   * Event Management
   * Sets up all event listeners for user interactions
   */
  attachEventListeners() {
    const newTodoInput = document.getElementById('new-todo');
    const todoList = document.getElementById('todo-list');
    const continueBtn = document.getElementById('continue-procrastinate');
    const clearCompletedBtn = document.getElementById('clear-completed');
    const addTodoBtn = document.getElementById('add-todo-btn');
    const toggleCompletedBtn = document.getElementById('toggle-completed');

    if (newTodoInput) {
      newTodoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.addTodo();
        }
      });
    }

    if (addTodoBtn) {
      addTodoBtn.addEventListener('click', () => {
        this.addTodo();
      });
    }

    if (todoList) {
      todoList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-todo') || e.target.closest('.delete-todo')) {
          const todoId = parseInt(e.target.closest('li').dataset.id);
          this.deleteTodo(todoId);
        } else if (e.target.classList.contains('todo-checkbox') || e.target.closest('.todo-checkbox')) {
          const todoId = parseInt(e.target.closest('li').dataset.id);
          this.toggleTodoStatus(todoId);
        }
      });
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        this.newTaskSince = null;
        this.saveSession();
        this.dismissModal();
        this.startTimer();
      });
    }

    if (clearCompletedBtn) {
      clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
    }

    if (toggleCompletedBtn) {
      toggleCompletedBtn.addEventListener('click', () => {
        this.hideCompleted = !this.hideCompleted;
        toggleCompletedBtn.classList.toggle('active', this.hideCompleted);
        this.renderTodos();
      });
    }
  }

  /**
   * Site Hotkeys
   * Captured on window so YouTube's hotkeys (k, j, l, space...) don't fire behind the modal
   */
  handleKeydown = (e) => {
    if (document.getElementById('doitfirst-modal')) {
      e.stopPropagation();
    }
  };

  /**
   * Media Control
   * Keeps videos stopped while the modal is open, and leaves fullscreen so it can be seen
   */
  pauseMedia() {
    document.querySelectorAll('video, audio').forEach(media => media.pause());

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  handleMediaPlay = (e) => {
    if (document.getElementById('doitfirst-modal')) {
      e.target.pause();
    }
  };

  /**
   * Modal Management
   * Handles modal dismissal with animation
   */
  dismissModal() {
    const modal = document.getElementById('doitfirst-modal');
    if (modal) {
      modal.classList.add('dismissing');
      setTimeout(() => {
        modal.remove();
        this.modalActive = false;
        
        // Keep footer and floating buttons visible when timer is running
        if (this.timer) {
          const footer = document.getElementById('doitfirst-footer');
          const floatingButtons = document.getElementById('doitfirst-floating-buttons');
          
          if (footer) {
            footer.classList.add('visible');
          }
          
          if (floatingButtons) {
            floatingButtons.classList.add('timer-hover');
            floatingButtons.style.display = 'flex';
          }
          
          // Explicitly show the timer
          const timerDisplay = document.getElementById('doitfirst-timer');
          if (timerDisplay) {
            timerDisplay.classList.add('visible');
            timerDisplay.style.opacity = '1';
            timerDisplay.style.visibility = 'visible';
          }
        } else {
          // If timer is not running, start it
          this.startTimer();
        }
        
        this.updateTimerDisplay();
      }, 500);
    }
  }

  /**
   * Timer Management
   * Handles timer initialization and countdown
   */
  startTimer() {
    // Clear any existing timer
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    // If timer is already at zero, don't start it
    if (this.remainingTime <= 0) {
      this.createModal();
      this.modalActive = true;
      return;
    }
    
    // Show the reset button and floating buttons when timer is running
    const resetBtn = document.getElementById('doitfirst-reset-btn');
    const floatingButtons = document.getElementById('doitfirst-floating-buttons');
    const footer = document.getElementById('doitfirst-footer');
    const timerDisplay = document.getElementById('doitfirst-timer');
    
    if (resetBtn) {
      resetBtn.classList.remove('doitfirst-hidden');
    }
    
    if (floatingButtons) {
      floatingButtons.style.display = 'flex';
      floatingButtons.classList.add('timer-hover');
    }
    
    if (footer) {
      footer.classList.add('visible');
    }
    
    // Explicitly show the timer if modal is not active
    if (timerDisplay && !this.modalActive) {
      timerDisplay.classList.add('visible');
      timerDisplay.style.opacity = '1';
      timerDisplay.style.visibility = 'visible';
    }
    
    // Record the start time
    this.lastTimerUpdate = Date.now();
    
    // Start the timer
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /**
   * Timer Tick
   * Counts real time instead of ticks, because Chrome slows timers in background tabs.
   * The time left is shared, so it's read fresh and two tabs don't spend it twice.
   */
  tick() {
    // A hidden tab only spends time while it's still playing something
    if (document.visibilityState === 'hidden' && !this.isMediaPlaying()) {
      this.lastTimerUpdate = Date.now();
      return;
    }

    this.loadSession(() => {
      if (!this.timer) {
        return;
      }

      // Another tab on this site used up the time
      if (this.newTaskSince) {
        clearInterval(this.timer);
        this.timer = null;
        this.showTimeUpModal();
        return;
      }

      const now = Date.now();
      const spentUntil = Math.max(this.lastTimerUpdate, this.sessionUpdatedAt);
      const elapsed = Math.floor((now - spentUntil) / 1000);

      if (elapsed < 1) {
        return;
      }

      if (elapsed > MAX_TICK_SECONDS) {
        this.lastTimerUpdate = now;
      } else {
        this.lastTimerUpdate = spentUntil + elapsed * 1000;
        this.remainingTime = Math.max(0, this.remainingTime - elapsed);
      }

      this.updateTimerDisplay();

      // When timer reaches zero, show the modal again
      if (this.remainingTime <= 0) {
        this.endSession();
        return;
      }

      this.saveSession();
    });
  }

  isMediaPlaying() {
    return Array.from(document.querySelectorAll('video, audio')).some(media => !media.paused && !media.ended);
  }

  /**
   * Session End
   * The next session has to be earned with a new task, not just by clicking Continue
   */
  endSession() {
    clearInterval(this.timer);
    this.timer = null;
    this.remainingTime = this.options.timerDuration;
    this.newTaskSince = Date.now();
    this.saveSession();
    this.showTimeUpModal();
  }

  showTimeUpModal() {
    // Set modal active first to ensure timer is hidden
    this.modalActive = true;

    const resetBtn = document.getElementById('doitfirst-reset-btn');
    if (resetBtn) {
      resetBtn.classList.add('doitfirst-hidden');
    }

    // Explicitly hide the timer display
    const timerDisplay = document.getElementById('doitfirst-timer');
    if (timerDisplay) {
      timerDisplay.classList.remove('visible');
      timerDisplay.style.opacity = '0';
      timerDisplay.style.visibility = 'hidden';
    }

    // Create modal after hiding timer
    this.createModal();
  }

  /**
   * Timer UI
   * Updates the timer display and handles visual states
   */
  updateTimerDisplay() {
    const timerDisplay = document.getElementById('doitfirst-timer');
    if (timerDisplay) {
      timerDisplay.innerHTML = this.formatTime(this.remainingTime);
      
      // Add warning class when less than 5 minutes remaining
      if (this.remainingTime < 300) {
        timerDisplay.classList.add('warning');
      } else {
        timerDisplay.classList.remove('warning');
      }
      
      // Show timer only when modal is not active
      if (this.modalActive) {
        timerDisplay.classList.remove('visible');
        timerDisplay.style.opacity = '0';
        timerDisplay.style.visibility = 'hidden';
      } else {
        timerDisplay.classList.add('visible');
        timerDisplay.style.opacity = '1';
        timerDisplay.style.visibility = 'visible';
      }
    }
  }
  
  /**
   * Timer Utilities
   * Formats time for display
   */
  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * UI State Management
   * Updates continue button state based on todo completion
   */
  updateContinueButton() {
    const continueBtn = document.getElementById('continue-procrastinate');
    const continueInfo = document.getElementById('continue-info');
    
    if (continueBtn) {
      // Only enable the continue button if there are todos and all of them are completed
      const allTodosCompleted = this.todos.length > 0 && this.todos.every(todo => todo.completed);
      const needsNewTask = this.newTaskSince && !this.todos.some(todo => todo.id >= this.newTaskSince);

      if (allTodosCompleted && !needsNewTask) {
        continueBtn.removeAttribute('disabled');
        if (continueInfo) {
          continueInfo.textContent = 'Continue';
        }
      } else {
        continueBtn.setAttribute('disabled', 'true');
        if (continueInfo) {
          if (this.todos.length === 0) {
            continueInfo.textContent = 'Add and complete tasks to continue';
          } else if (allTodosCompleted) {
            continueInfo.textContent = 'Add a new task to continue';
          } else {
            const remainingTasks = this.todos.filter(todo => !todo.completed).length;
            continueInfo.textContent = `${remainingTasks} more task${remainingTasks !== 1 ? 's' : ''} remaining`;
          }
        }
      }
    }
  }

  /**
   * Todo Management - Core Operations
   * Handles adding, deleting, toggling, and clearing todos
   */
  addTodo() {
    const newTodoInput = document.getElementById('new-todo');
    const todoText = newTodoInput.value.trim();
    
    if (todoText) {
      const newTodo = {
        id: Date.now(),
        text: todoText,
        completed: false,
        createdAt: new Date().toISOString()
      };
      
      this.todos.push(newTodo);
      this.saveTodos();
      this.renderTodos();
      this.updateContinueButton();
      newTodoInput.value = '';
    }
  }

  deleteTodo(id) {
    this.todos = this.todos.filter(todo => todo.id !== id);
    this.saveTodos();
    this.renderTodos();
    this.updateContinueButton();
  }

  toggleTodoStatus(id) {
    this.todos = this.todos.map(todo => {
      if (todo.id === id) {
        return { ...todo, completed: !todo.completed };
      }
      return todo;
    });
    
    this.saveTodos();
    this.renderTodos();
    this.updateContinueButton();
  }

  clearCompleted() {
    this.todos = this.todos.filter(todo => !todo.completed);
    this.saveTodos();
    this.renderTodos();
    this.updateContinueButton();
  }

  /**
   * Todo Management - Filtering
   * Legacy method for todo filtering
   */
  filterTodos(filter) {
    // This method is no longer needed since we removed the filter buttons
    // But we'll keep it for backward compatibility
    const todoList = document.getElementById('todo-list');
    if (!todoList) return;

    const items = todoList.querySelectorAll('li');
    items.forEach(item => {
      // Always show all todos
      item.style.display = 'flex';
    });
  }

  /**
   * Todo UI
   * Renders the todo list and updates UI state
   */
  renderTodos() {
    const todoList = document.getElementById('todo-list');
    const itemsLeftSpan = document.getElementById('items-left');
    
    if (todoList) {
      todoList.innerHTML = '';
      
      this.todos.forEach((todo, index) => {
        // Skip completed todos if hideCompleted is true
        if (this.hideCompleted && todo.completed) {
          return;
        }

        const li = document.createElement('li');
        li.dataset.id = todo.id;
        li.tabIndex = 0;
        if (todo.completed) {
          li.classList.add('completed');
        }
        
        li.innerHTML = `
          <div class="todo-item-left">
            <div class="todo-checkbox ${todo.completed ? 'checked' : ''}" tabindex="0" role="checkbox" aria-checked="${todo.completed}">
              ${todo.completed ? '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path></svg>' : ''}
            </div>
            <span class="todo-text"></span>
          </div>
          <button class="delete-todo" aria-label="Delete task">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H3.5C3.22386 4 3 3.77614 3 3.5ZM3.81825 5H11.1818L10.4429 12.8943C10.3728 13.5919 9.78696 14.1346 9.08322 14.1346H5.91679C5.21305 14.1346 4.62719 13.5919 4.55711 12.8943L3.81825 5ZM5.80113 6C5.52499 6 5.30248 6.22386 5.30248 6.5C5.30248 6.77614 5.52499 7 5.80113 7V11.5C5.80113 11.7761 6.02499 12 6.30113 12C6.57727 12 6.80113 11.7761 6.80113 11.5V7C6.80113 6.72386 6.57727 6.5 6.30113 6.5H5.80113ZM8.30113 6C8.02499 6 7.80113 6.22386 7.80113 6.5C7.80113 6.77614 8.02499 7 8.30113 7V11.5C8.30113 11.7761 8.52499 12 8.80113 12C9.07727 12 9.30113 11.7761 9.30113 11.5V7C9.30113 6.72386 9.07727 6.5 8.80113 6.5H8.30113Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
            </svg>
          </button>
        `;
        
        li.querySelector('.todo-text').textContent = todo.text;
        todoList.appendChild(li);
      });
    }
    
    if (itemsLeftSpan) {
      const activeCount = this.todos.filter(todo => !todo.completed).length;
      itemsLeftSpan.textContent = `${activeCount} item${activeCount !== 1 ? 's' : ''} left`;
    }
    
    this.updateContinueButton();
  }

  /**
   * Data Persistence
   * Handles saving todos to storage
   */
  saveTodos() {
    chrome.storage.sync.set({ todos: this.todos });
  }

  /**
   * Timer Control
   * Ends the session early. The time left is given up, so this can't buy extra time.
   */
  resetTimerAndShowModal() {
    if (!document.getElementById('doitfirst-modal')) {
      this.endSession();
    }
  }

  /**
   * Settings UI
   * Manages settings panel display and positioning
   */
  showSettingsPanel(panel, button) {
    const btnRect = button.getBoundingClientRect();
    const panelWidth = 280; // Width of the settings panel
    const padding = 16; // Padding from viewport edges
    
    // Calculate initial position
    let top = btnRect.bottom + 10;
    let left = btnRect.left; // Changed from right to left positioning
    
    // Check right boundary
    if (left + panelWidth + padding > window.innerWidth) {
      left = window.innerWidth - panelWidth - padding;
    }
    
    // Check bottom boundary
    const panelHeight = panel.offsetHeight || 300; // Fallback height if panel not rendered yet
    if (top + panelHeight > window.innerHeight) {
      top = Math.max(padding, btnRect.top - panelHeight - 10);
    }
    
    // Apply calculated position
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`; // Changed from right to left
    panel.style.right = 'auto'; // Reset right position
    
    // Show panel with animation
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-10px)';
    panel.classList.add('visible');
    
    // Trigger reflow
    void panel.offsetWidth;
    
    // Apply final state
    panel.style.opacity = '1';
    panel.style.transform = 'translateY(0)';
    
    // Add click outside listener
    setTimeout(() => {
      document.addEventListener('click', this.handleClickOutside);
    }, 0);
  }

  hideSettingsPanel(panel) {
    // Hide with animation
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-10px)';
    
    // Remove visible class after animation
    setTimeout(() => {
      panel.classList.remove('visible');
      panel.style.opacity = '';
      panel.style.transform = '';
    }, 200);
    
    // Remove click outside listener
    document.removeEventListener('click', this.handleClickOutside);
  }

  /**
   * Event Handlers
   * Handles click outside settings panel
   */
  handleClickOutside = (e) => {
    const settingsPanel = document.getElementById('doitfirst-settings-panel');
    const settingsBtn = document.getElementById('doitfirst-settings-btn');
    
    if (settingsPanel && settingsBtn) {
      const isClickInside = settingsPanel.contains(e.target) || settingsBtn.contains(e.target);
      
      if (!isClickInside) {
        this.hideSettingsPanel(settingsPanel);
      }
    }
  };
}

// Initialize extension
const doItFirst = new DoItFirst();
doItFirst.initialize(); 