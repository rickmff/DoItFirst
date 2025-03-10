// Save options to chrome.storage
function saveOptions() {
  const alwaysShowModal = document.getElementById('always-show-modal').checked;
  const clearTodosDaily = document.getElementById('clear-todos-daily').checked;
  const enableTwitter = document.getElementById('enable-twitter').checked;
  const enableYoutube = document.getElementById('enable-youtube').checked;
  const enableInstagram = document.getElementById('enable-instagram').checked;
  const enableTiktok = document.getElementById('enable-tiktok').checked;
  
  chrome.storage.sync.set(
    {
      alwaysShowModal: alwaysShowModal,
      clearTodosDaily: clearTodosDaily,
      enabledPlatforms: {
        twitter: enableTwitter,
        youtube: enableYoutube,
        instagram: enableInstagram,
        tiktok: enableTiktok
      }
    },
    function() {
      // Update status to let user know options were saved
      const status = document.getElementById('status');
      status.textContent = 'Options saved!';
      status.classList.add('success');
      
      setTimeout(function() {
        status.textContent = '';
        status.classList.remove('success');
      }, 3000);
    }
  );
}

// Restore options from chrome.storage
function restoreOptions() {
  chrome.storage.sync.get(
    {
      alwaysShowModal: true,
      clearTodosDaily: false,
      enabledPlatforms: {
        twitter: true,
        youtube: true,
        instagram: true,
        tiktok: true
      }
    },
    function(items) {
      document.getElementById('always-show-modal').checked = items.alwaysShowModal;
      document.getElementById('clear-todos-daily').checked = items.clearTodosDaily;
      document.getElementById('enable-twitter').checked = items.enabledPlatforms.twitter;
      document.getElementById('enable-youtube').checked = items.enabledPlatforms.youtube;
      document.getElementById('enable-instagram').checked = items.enabledPlatforms.instagram;
      document.getElementById('enable-tiktok').checked = items.enabledPlatforms.tiktok;
    }
  );
}

// Initialize the options page
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions); 