/**
 * Dictionaries Page - Main JavaScript
 * Handles: My Dictionaries, Marketplace, Generator
 */

(function() {
  'use strict';

  // API Endpoints
  const API = {
    MY_DICTIONARIES: '/user/dictionaries',
    MARKETPLACE: '/marketplace/dictionaries',
    GENERATION_INFO: '/user/generation-info',
    GENERATE: '/generate-dictionary',
    ADD_TO_LIBRARY: (id) => `/marketplace/dictionaries/${id}/add`
  };

  // State
  let state = {
    myDictionaries: [],
    marketplaceDictionaries: [],
    generationInfo: { available: 10, total: 10 },
    currentTab: 'my-dictionaries',
    generatorStep: 1,
    generatedWords: [],
    editingWordIndex: null
  };

  // DOM Elements
  const elements = {};

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    setupEventListeners();
    loadGenerationInfo();
    loadMyDictionaries();
    updateGenerationCounter();
  }

  function cacheElements() {
    // Tabs
    elements.tabs = document.querySelectorAll('.tab-btn');
    elements.tabContents = document.querySelectorAll('.tab-content');
    
    // My Dictionaries
    elements.myDictionariesGrid = document.getElementById('myDictionariesGrid');
    elements.myDictionariesEmpty = document.getElementById('myDictionariesEmpty');
    elements.myDictSearch = document.getElementById('myDictSearch');
    elements.myDictCategory = document.getElementById('myDictCategory');
    elements.myDictPrivacy = document.getElementById('myDictPrivacy');
    
    // Marketplace
    elements.marketplaceGrid = document.getElementById('marketplaceGrid');
    elements.marketplaceEmpty = document.getElementById('marketplaceEmpty');
    elements.marketplaceSearch = document.getElementById('marketplaceSearch');
    elements.marketplaceCategory = document.getElementById('marketplaceCategory');
    elements.marketplaceLanguage = document.getElementById('marketplaceLanguage');
    elements.marketplaceSort = document.getElementById('marketplaceSort');
    
    // Generator
    elements.generatorSteps = document.querySelectorAll('.wizard-step');
    elements.genTopic = document.getElementById('genTopic');
    elements.genSourceLang = document.getElementById('genSourceLang');
    elements.genTargetLang = document.getElementById('genTargetLang');
    elements.genDifficulty = document.getElementById('genDifficulty');
    elements.genWordCount = document.getElementById('genWordCount');
    elements.genCategory = document.getElementById('genCategory');
    elements.wordsTableBody = document.getElementById('wordsTableBody');
    elements.dictName = document.getElementById('dictName');
    elements.dictDescription = document.getElementById('dictDescription');
    
    // Counter
    elements.genCountValue = document.getElementById('genCountValue');
    elements.remainingGens = document.getElementById('remainingGens');
    
    // Modals
    elements.dictionaryPreviewModal = document.getElementById('dictionaryPreviewModal');
    elements.wordEditModal = document.getElementById('wordEditModal');
    elements.importWordsModal = document.getElementById('importWordsModal');
    
    // Toast
    elements.toastContainer = document.getElementById('toastContainer');
  }

  function setupEventListeners() {
    // Tab switching
    elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Back button
    const backBtn = document.getElementById('btnBack');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.location.href = '/';
      });
    }

    // Profile button
    const profileBtn = document.getElementById('btnProfile');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        window.location.href = '../auth/index.html';
      });
    }

    // My Dictionaries filters
    if (elements.myDictSearch) {
      elements.myDictSearch.addEventListener('input', filterMyDictionaries);
    }
    if (elements.myDictPrivacy) {
      elements.myDictPrivacy.addEventListener('change', filterMyDictionaries);
    }

    // Marketplace filters
    if (elements.marketplaceSearch) {
      elements.marketplaceSearch.addEventListener('input', filterMarketplace);
    }
    if (elements.marketplaceSort) {
      elements.marketplaceSort.addEventListener('change', filterMarketplace);
    }

    // Generator buttons
    const btnGeneratePreview = document.getElementById('btnGeneratePreview');
    if (btnGeneratePreview) {
      btnGeneratePreview.addEventListener('click', generatePreview);
    }

    const btnBackToStep1 = document.getElementById('btnBackToStep1');
    if (btnBackToStep1) {
      btnBackToStep1.addEventListener('click', () => showGeneratorStep(1));
    }

    const btnRegenerate = document.getElementById('btnRegenerate');
    if (btnRegenerate) {
      btnRegenerate.addEventListener('click', generatePreview);
    }

    const btnSaveDictionary = document.getElementById('btnSaveDictionary');
    if (btnSaveDictionary) {
      btnSaveDictionary.addEventListener('click', () => showGeneratorStep(3));
    }

    const btnBackToEdit = document.getElementById('btnBackToEdit');
    if (btnBackToEdit) {
      btnBackToEdit.addEventListener('click', () => showGeneratorStep(2));
    }

    const btnFinalSave = document.getElementById('btnFinalSave');
    if (btnFinalSave) {
      btnFinalSave.addEventListener('click', saveDictionary);
    }

    const btnCreateNewDict = document.getElementById('btnCreateNewDict');
    if (btnCreateNewDict) {
      btnCreateNewDict.addEventListener('click', () => switchTab('generator'));
    }

    const btnGoToMarketplaceFromEmpty = document.getElementById('btnGoToMarketplaceFromEmpty');
    if (btnGoToMarketplaceFromEmpty) {
      btnGoToMarketplaceFromEmpty.addEventListener('click', () => switchTab('marketplace'));
    }

    // Word editor buttons
    const btnAddWord = document.getElementById('btnAddWord');
    if (btnAddWord) {
      btnAddWord.addEventListener('click', () => openWordEditModal());
    }

    const btnImportWords = document.getElementById('btnImportWords');
    if (btnImportWords) {
      btnImportWords.addEventListener('click', () => openImportModal());
    }

    // Modal close buttons
    setupModalClose('dictionaryPreviewModal');
    setupModalClose('wordEditModal');
    setupModalClose('importWordsModal');
  }

  function setupModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => hideModal(modalId));
    }
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideModal(modalId);
      }
    });
  }

  // Tab Switching
  function switchTab(tabId) {
    state.currentTab = tabId;
    
    // Update tab buttons
    elements.tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    
    // Update tab content
    elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });
    
    // Load data based on tab
    if (tabId === 'my-dictionaries') {
      loadMyDictionaries();
    } else if (tabId === 'marketplace') {
      loadMarketplace();
    } else if (tabId === 'generator') {
      loadGenerationInfo();
    }
  }

  // Generation Info
  async function loadGenerationInfo() {
    try {
      const response = await fetch(API.GENERATION_INFO, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        state.generationInfo = data;
        updateGenerationCounter();
      }
    } catch (error) {
      console.error('Failed to load generation info:', error);
    }
  }

  function updateGenerationCounter() {
    const count = state.generationInfo.available || 0;
    if (elements.genCountValue) {
      elements.genCountValue.textContent = count;
    }
    if (elements.remainingGens) {
      elements.remainingGens.textContent = count;
    }
  }

  // My Dictionaries - export to window for modal usage
  window.loadMyDictionaries = async function() {
    const myDictionariesGrid = document.getElementById('myDictionariesGrid');
    const myDictionariesEmpty = document.getElementById('myDictionariesEmpty');
    if (!myDictionariesGrid) return;
    
    elements.myDictionariesGrid.innerHTML = `
      <div class="loading-state">
        <span class="material-symbols-rounded spinning">progress_activity</span>
        <p>Загрузка словарей...</p>
      </div>
    `;
    
    try {
      const response = await fetch(API.MY_DICTIONARIES, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const dictionaries = await response.json();
        state.myDictionaries = dictionaries;
        renderMyDictionaries(dictionaries);
      } else {
        throw new Error('Failed to load dictionaries');
      }
    } catch (error) {
      console.error('Error loading dictionaries:', error);
      elements.myDictionariesGrid.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">error</span>
          <h3>Ошибка загрузки</h3>
          <p>Не удалось загрузить словари. Попробуйте позже.</p>
        </div>
      `;
    }
  }

  function renderMyDictionaries(dictionaries) {
    if (!elements.myDictionariesGrid) return;
    
    if (dictionaries.length === 0) {
      elements.myDictionariesGrid.innerHTML = '';
      elements.myDictionariesEmpty.hidden = false;
      return;
    }
    
    elements.myDictionariesEmpty.hidden = true;
    elements.myDictionariesGrid.innerHTML = dictionaries.map(dict => createDictionaryCard(dict, 'my')).join('');
    
    // Add event listeners to cards
    elements.myDictionariesGrid.querySelectorAll('.dict-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.btn')) {
          const dictId = card.dataset.dictId;
          // Navigate to edit or view
          showToast('info', 'Функция редактирования в разработке');
        }
      });
    });
  }

  function filterMyDictionaries() {
    const search = (elements.myDictSearch?.value || '').toLowerCase();
    const privacy = elements.myDictPrivacy?.value || '';
    
    let filtered = state.myDictionaries;
    
    if (search) {
      filtered = filtered.filter(dict => 
        dict.name.toLowerCase().includes(search) ||
        (dict.description && dict.description.toLowerCase().includes(search))
      );
    }
    
    if (privacy) {
      filtered = filtered.filter(dict => dict.is_public === (privacy === 'public'));
    }
    
    renderMyDictionaries(filtered);
  }

  // Marketplace
  async function loadMarketplace() {
    if (!elements.marketplaceGrid) return;
    
    elements.marketplaceGrid.innerHTML = `
      <div class="loading-state">
        <span class="material-symbols-rounded spinning">progress_activity</span>
        <p>Загрузка маркетплейса...</p>
      </div>
    `;
    
    try {
      const response = await fetch(API.MARKETPLACE, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const dictionaries = await response.json();
        state.marketplaceDictionaries = dictionaries;
        renderMarketplace(dictionaries);
      } else {
        throw new Error('Failed to load marketplace');
      }
    } catch (error) {
      console.error('Error loading marketplace:', error);
      elements.marketplaceGrid.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-rounded">error</span>
          <h3>Ошибка загрузки</h3>
          <p>Не удалось загрузить маркетплейс. Попробуйте позже.</p>
        </div>
      `;
    }
  }

  function renderMarketplace(dictionaries) {
    if (!elements.marketplaceGrid) return;
    
    if (dictionaries.length === 0) {
      elements.marketplaceGrid.innerHTML = '';
      elements.marketplaceEmpty.hidden = false;
      return;
    }
    
    elements.marketplaceEmpty.hidden = true;
    elements.marketplaceGrid.innerHTML = dictionaries.map(dict => createDictionaryCard(dict, 'marketplace')).join('');
  }

  function filterMarketplace() {
    const search = (elements.marketplaceSearch?.value || '').toLowerCase();
    const sort = elements.marketplaceSort?.value || 'popular';
    
    let filtered = state.marketplaceDictionaries;
    
    if (search) {
      filtered = filtered.filter(dict => 
        dict.name.toLowerCase().includes(search) ||
        (dict.description && dict.description.toLowerCase().includes(search))
      );
    }
    
    // Sorting
    if (sort === 'newest') {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === 'rating') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'popular') {
      filtered.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    }
    
    renderMarketplace(filtered);
  }

  // Create Dictionary Card HTML
  function createDictionaryCard(dict, type) {
    const isPublic = dict.is_public;
    const wordCount = dict.words ? dict.words.length : (dict.word_count || 0);
    const languagePair = `${dict.source_lang || 'ru'} → ${dict.target_lang || 'en'}`;
    
    let actions = '';
    if (type === 'marketplace') {
      actions = `
        <button class="btn primary" onclick="event.stopPropagation(); previewDictionary('${dict.id}')">
          <span class="material-symbols-rounded">visibility</span>
          Предпросмотр
        </button>
        <button class="btn success" onclick="event.stopPropagation(); addToLibrary('${dict.id}')">
          <span class="material-symbols-rounded">add_to_queue</span>
          Добавить
        </button>
      `;
    } else {
      actions = `
        <button class="btn ghost" onclick="event.stopPropagation(); editDictionary('${dict.id}')">
          <span class="material-symbols-rounded">edit</span>
          Редактировать
        </button>
        <button class="btn warn" onclick="event.stopPropagation(); deleteDictionary('${dict.id}')">
          <span class="material-symbols-rounded">delete</span>
          Удалить
        </button>
      `;
    }
    
    return `
      <div class="dict-card" data-dict-id="${dict.id}">
        <div class="dict-card-header">
          <h3 class="dict-card-title">${escapeHtml(dict.name)}</h3>
          <span class="dict-card-privacy ${isPublic ? 'public' : 'private'}">
            <span class="material-symbols-rounded" style="font-size:14px;">${isPublic ? 'public' : 'lock'}</span>
            ${isPublic ? 'Публичный' : 'Приватный'}
          </span>
        </div>
        <div class="dict-card-meta">
          <div class="dict-card-chip">
            <span class="material-symbols-rounded">language</span>
            ${languagePair}
          </div>
          <div class="dict-card-chip">
            <span class="material-symbols-rounded">format_list_numbered</span>
            ${wordCount} слов
          </div>
          ${dict.category ? `
            <div class="dict-card-chip">
              <span class="material-symbols-rounded">category</span>
              ${dict.category}
            </div>
          ` : ''}
        </div>
        ${dict.description ? `<p class="dict-card-description">${escapeHtml(dict.description)}</p>` : ''}
        <div class="dict-card-actions">
          ${actions}
        </div>
      </div>
    `;
  }

  // Generator
  async function generatePreview() {
    const topic = elements.genTopic?.value.trim();
    const sourceLang = elements.genSourceLang?.value || 'ru';
    const targetLang = elements.genTargetLang?.value || 'en';
    const difficulty = elements.genDifficulty?.value || 'medium';
    const wordCount = parseInt(elements.genWordCount?.value) || 20;
    const category = elements.genCategory?.value || 'general';
    
    if (!topic) {
      showToast('error', 'Введите тему словаря');
      return;
    }
    
    if (state.generationInfo.available <= 0) {
      showToast('error', 'Превышен лимит генераций. Попробуйте через 24 часа.');
      return;
    }
    
    try {
      showToast('info', 'Генерация словаря...');
      
      const response = await fetch(API.GENERATE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          source_lang: sourceLang,
          target_lang: targetLang,
          difficulty,
          count: wordCount,
          category,
          preview: true // Don't consume generation yet
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        state.generatedWords = data.words || [];
        renderWordsTable(state.generatedWords);
        updatePreviewInfo(sourceLang, targetLang, difficulty, wordCount);
        showGeneratorStep(2);
        showToast('success', 'Словарь сгенерирован! Отредактируйте и сохраните.');
      } else {
        const error = await response.json();
        showToast('error', error.message || 'Ошибка генерации');
      }
    } catch (error) {
      console.error('Generation error:', error);
      showToast('error', 'Ошибка при генерации словаря');
    }
  }

  function renderWordsTable(words) {
    if (!elements.wordsTableBody) return;
    
    elements.wordsTableBody.innerHTML = words.map((word, index) => `
      <tr>
        <td><input type="text" value="${escapeHtml(word.word)}" data-index="${index}" data-field="word" /></td>
        <td><input type="text" value="${escapeHtml(word.translation || '')}" data-index="${index}" data-field="translation" /></td>
        <td><input type="text" value="${escapeHtml(word.hint || '')}" data-index="${index}" data-field="hint" /></td>
        <td>
          <button class="delete-btn" onclick="deleteWord(${index})" title="Удалить слово">
            <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
          </button>
        </td>
      </tr>
    `).join('');
    
    // Add input listeners
    elements.wordsTableBody.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        state.generatedWords[index][field] = e.target.value;
      });
    });
  }

  function updatePreviewInfo(sourceLang, targetLang, difficulty, wordCount) {
    const langNames = { ru: 'Русский', en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français' };
    const diffNames = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
    
    const previewLang = document.getElementById('previewLanguages');
    const previewDiff = document.getElementById('previewDifficulty');
    const previewCount = document.getElementById('previewWordCount');
    
    if (previewLang) previewLang.textContent = `${langNames[sourceLang] || sourceLang} → ${langNames[targetLang] || targetLang}`;
    if (previewDiff) previewDiff.textContent = diffNames[difficulty] || difficulty;
    if (previewCount) previewCount.textContent = `${wordCount} слов`;
  }

  function showGeneratorStep(step) {
    state.generatorStep = step;
    elements.generatorSteps.forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.step) === step);
    });
  }

  async function saveDictionary() {
    const name = elements.dictName?.value.trim();
    const description = elements.dictDescription?.value.trim();
    const privacy = document.querySelector('input[name="privacy"]:checked')?.value || 'private';
    
    if (!name) {
      showToast('error', 'Введите название словаря');
      return;
    }
    
    if (state.generatedWords.length === 0) {
      showToast('error', 'Словарь пуст');
      return;
    }
    
    try {
      showToast('info', 'Сохранение словаря...');
      
      const response = await fetch(API.MY_DICTIONARIES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          is_public: privacy === 'public',
          words: state.generatedWords,
          source_lang: elements.genSourceLang?.value || 'ru',
          target_lang: elements.genTargetLang?.value || 'en',
          difficulty: elements.genDifficulty?.value || 'medium',
          category: elements.genCategory?.value || 'general'
        })
      });
      
      if (response.ok) {
        showToast('success', 'Словарь сохранён!');
        // Reset and go to my dictionaries
        resetGenerator();
        switchTab('my-dictionaries');
        loadMyDictionaries();
        loadGenerationInfo();
      } else {
        const error = await response.json();
        showToast('error', error.message || 'Ошибка сохранения');
      }
    } catch (error) {
      console.error('Save error:', error);
      showToast('error', 'Ошибка при сохранении словаря');
    }
  }

  function resetGenerator() {
    if (elements.genTopic) elements.genTopic.value = '';
    if (elements.dictName) elements.dictName.value = '';
    if (elements.dictDescription) elements.dictDescription.value = '';
    state.generatedWords = [];
    showGeneratorStep(1);
  }

  // Word Editor Functions
  function openWordEditModal(wordIndex = null) {
    state.editingWordIndex = wordIndex;
    const modal = elements.wordEditModal;
    const title = document.getElementById('wordEditTitle');
    
    if (!modal || !title) return;
    
    if (wordIndex !== null && state.generatedWords[wordIndex]) {
      const word = state.generatedWords[wordIndex];
      title.textContent = 'Редактировать слово';
      document.getElementById('editWordSource').value = word.word || '';
      document.getElementById('editWordTarget').value = word.translation || '';
      document.getElementById('editWordHint').value = word.hint || '';
    } else {
      title.textContent = 'Добавить слово';
      document.getElementById('editWordSource').value = '';
      document.getElementById('editWordTarget').value = '';
      document.getElementById('editWordHint').value = '';
    }
    
    showModal('wordEditModal');
  }

  function openImportModal() {
    showModal('importWordsModal');
  }

  // Modal helpers
  function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = false;
  }

  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.hidden = true;
  }

  // Toast Notifications
  function showToast(type, message) {
    if (!elements.toastContainer) return;
    
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="material-symbols-rounded">${icons[type] || 'info'}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Utility
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Global functions for inline onclick handlers
  window.previewDictionary = function(dictId) {
    showToast('info', 'Предпросмотр словаря ' + dictId);
    // TODO: Implement preview modal
  };

  window.addToLibrary = async function(dictId) {
    try {
      const response = await fetch(API.ADD_TO_LIBRARY(dictId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        showToast('success', 'Словарь добавлен в библиотеку!');
        loadMyDictionaries();
      } else {
        const error = await response.json();
        showToast('error', error.message || 'Ошибка добавления');
      }
    } catch (error) {
      showToast('error', 'Ошибка при добавлении словаря');
    }
  };

  window.editDictionary = function(dictId) {
    showToast('info', 'Редактирование словаря ' + dictId);
    // TODO: Implement edit functionality
  };

  window.deleteDictionary = async function(dictId) {
    if (!confirm('Вы уверены, что хотите удалить этот словарь?')) return;
    
    try {
      const response = await fetch(`${API.MY_DICTIONARIES}?id=${dictId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        showToast('success', 'Словарь удалён');
        loadMyDictionaries();
      } else {
        showToast('error', 'Ошибка удаления');
      }
    } catch (error) {
      showToast('error', 'Ошибка при удалении словаря');
    }
  };

  window.deleteWord = function(index) {
    state.generatedWords.splice(index, 1);
    renderWordsTable(state.generatedWords);
  };

  // Export function for app.js to call
  window.showDictionaryModal = function() {
    // Create modal container if it doesn't exist
    let modal = document.getElementById('dictionaryManagementModal');
    if (modal) {
      modal.remove();
    }

    modal = document.createElement('div');
    modal.id = 'dictionaryManagementModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:900px; width:95%; max-height:85vh; overflow:auto; background:var(--bg-card); border-radius:16px; padding:24px; position:relative;">
        <button class="btn ghost" onclick="document.getElementById('dictionaryManagementModal').remove()" style="position:absolute; top:12px; right:12px; padding:8px;" title="Закрыть">
          <span class="material-symbols-rounded" style="font-size:20px;">close</span>
        </button>
        
        <h2 style="margin-bottom:20px;">📚 Мои Словари</h2>
        
        <!-- Tabs -->
        <div class="tabs" style="display:flex; gap:8px; margin-bottom:20px; border-bottom:2px solid var(--border);">
          <button class="tab-btn active" data-tab="my-dictionaries" style="padding:10px 16px; background:transparent; border:none; border-bottom:2px solid var(--primary); color:var(--text); cursor:pointer; font-weight:500;">Мои словари</button>
          <button class="tab-btn" data-tab="marketplace" style="padding:10px 16px; background:transparent; border:none; border-bottom:2px solid transparent; color:var(--text-secondary); cursor:pointer; font-weight:500;">Маркетплейс</button>
          <button class="tab-btn" data-tab="generator" style="padding:10px 16px; background:transparent; border:none; border-bottom:2px solid transparent; color:var(--text-secondary); cursor:pointer; font-weight:500;">Конструктор</button>
        </div>
        
        <!-- Tab Contents -->
        <div id="tab-my-dictionaries" class="tab-content">
          <div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
            <input type="text" id="myDictSearch" placeholder="Поиск..." style="flex:1; min-width:200px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
            <select id="myDictCategory" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              <option value="">Все категории</option>
              <option value="animals">Животные</option>
              <option value="geography">География</option>
              <option value="professions">Профессии</option>
              <option value="technology">Технологии</option>
              <option value="entertainment">Развлечения</option>
            </select>
            <select id="myDictPrivacy" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              <option value="">Все</option>
              <option value="private">Приватные</option>
              <option value="public">Публичные</option>
            </select>
          </div>
          <div id="myDictionariesGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;"></div>
          <div id="myDictionariesEmpty" style="text-align:center; padding:40px; color:var(--text-secondary);" hidden>
            <p>У вас пока нет словарей</p>
            <button class="btn" onclick="document.querySelector('[data-tab=\\'generator\\']').click()" style="margin-top:12px;">Создать первый словарь</button>
          </div>
        </div>
        
        <div id="tab-marketplace" class="tab-content" hidden>
          <div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
            <input type="text" id="marketplaceSearch" placeholder="Поиск..." style="flex:1; min-width:200px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
            <select id="marketplaceCategory" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              <option value="">Все категории</option>
              <option value="animals">Животные</option>
              <option value="geography">География</option>
              <option value="professions">Профессии</option>
              <option value="technology">Технологии</option>
              <option value="entertainment">Развлечения</option>
            </select>
            <select id="marketplaceLanguage" style="padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              <option value="">Все языки</option>
              <option value="en-ru">Английский → Русский</option>
              <option value="ru-en">Русский → Английский</option>
            </select>
          </div>
          <div id="marketplaceGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;"></div>
          <div id="marketplaceEmpty" style="text-align:center; padding:40px; color:var(--text-secondary);" hidden>
            <p>Маркетплейс пуст</p>
          </div>
        </div>
        
        <div id="tab-generator" class="tab-content" hidden>
          <div style="margin-bottom:16px;">
            <div style="display:inline-block; padding:8px 16px; background:var(--primary); color:white; border-radius:20px; font-size:0.9rem;">
              Доступно генераций: <strong id="genCountValue">${state.generationInfo.available}</strong> из ${state.generationInfo.total}
            </div>
          </div>
          
          <!-- Step 1: Basic Settings -->
          <div id="genStep1" class="wizard-step">
            <h3>Шаг 1: Основные настройки</h3>
            <div style="display:grid; gap:16px; margin:16px 0;">
              <div>
                <label style="display:block; margin-bottom:6px; font-weight:500;">Тема словаря</label>
                <input type="text" id="genTopic" placeholder="Например: животные, космос, еда..." style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div>
                  <label style="display:block; margin-bottom:6px; font-weight:500;">Язык слов</label>
                  <select id="genSourceLang" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
                    <option value="ru">Русский</option>
                    <option value="en">Английский</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; margin-bottom:6px; font-weight:500;">Язык описаний</label>
                  <select id="genTargetLang" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
                    <option value="ru">Русский</option>
                    <option value="en">Английский</option>
                  </select>
                </div>
              </div>
              <div>
                <label style="display:block; margin-bottom:6px; font-weight:500;">Сложность</label>
                <select id="genDifficulty" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
                  <option value="easy">Лёгкий</option>
                  <option value="medium" selected>Средний</option>
                  <option value="hard">Сложный</option>
                </select>
              </div>
              <div>
                <label style="display:block; margin-bottom:6px; font-weight:500;">Количество слов</label>
                <input type="number" id="genWordCount" min="5" max="50" value="20" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              </div>
            </div>
            <button class="btn" id="genNextBtn1" style="margin-top:16px;">Далее →</button>
          </div>
          
          <!-- Step 2: Review & Edit -->
          <div id="genStep2" class="wizard-step" hidden>
            <h3>Шаг 2: Редактирование слов</h3>
            <div style="margin:16px 0; overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:2px solid var(--border);">
                    <th style="padding:8px; text-align:left;">Слово</th>
                    <th style="padding:8px; text-align:left;">Описание</th>
                    <th style="padding:8px;">Действия</th>
                  </tr>
                </thead>
                <tbody id="wordsTableBody"></tbody>
              </table>
            </div>
            <div style="display:flex; gap:12px; margin-top:16px;">
              <button class="btn ghost" id="genBackBtn2">← Назад</button>
              <button class="btn" id="genNextBtn2">Далее →</button>
            </div>
          </div>
          
          <!-- Step 3: Save Settings -->
          <div id="genStep3" class="wizard-step" hidden>
            <h3>Шаг 3: Сохранение словаря</h3>
            <div style="display:grid; gap:16px; margin:16px 0;">
              <div>
                <label style="display:block; margin-bottom:6px; font-weight:500;">Название словаря</label>
                <input type="text" id="dictName" placeholder="Мой словарь" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              </div>
              <div>
                <label style="display:block; margin-bottom:6px; font-weight:500;">Описание (необязательно)</label>
                <textarea id="dictDescription" rows="3" placeholder="Краткое описание словаря..." style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text); resize:vertical;"></textarea>
              </div>
              <div>
                <label style="display:block; margin-bottom:6px; font-weight:500;">Видимость</label>
                <div style="display:flex; gap:16px;">
                  <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="radio" name="dictPrivacy" value="private" checked>
                    <span>Приватный (только я)</span>
                  </label>
                  <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="radio" name="dictPrivacy" value="public">
                    <span>Публичный (маркетплейс)</span>
                  </label>
                </div>
              </div>
            </div>
            <div style="display:flex; gap:12px; margin-top:16px;">
              <button class="btn ghost" id="genBackBtn3">← Назад</button>
              <button class="btn" id="genSaveBtn">Сохранить словарь</button>
            </div>
          </div>
        </div>
        
        <!-- Preview Modal -->
        <div id="dictionaryPreviewModal" class="modal-overlay" hidden>
          <div class="modal-content" style="max-width:600px; width:90%; background:var(--bg-card); border-radius:16px; padding:24px; position:relative;">
            <button class="btn ghost" onclick="document.getElementById('dictionaryPreviewModal').hidden=true" style="position:absolute; top:12px; right:12px; padding:8px;">✕</button>
            <h3 id="previewTitle" style="margin-bottom:12px;"></h3>
            <div id="previewMeta" style="color:var(--text-secondary); margin-bottom:16px;"></div>
            <div id="previewWords" style="max-height:300px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:12px;"></div>
            <button class="btn btn-full" id="previewAddBtn" style="margin-top:16px;">Добавить в библиотеку</button>
          </div>
        </div>
        
        <!-- Word Edit Modal -->
        <div id="wordEditModal" class="modal-overlay" hidden>
          <div class="modal-content" style="max-width:500px; width:90%; background:var(--bg-card); border-radius:16px; padding:24px; position:relative;">
            <button class="btn ghost" onclick="document.getElementById('wordEditModal').hidden=true" style="position:absolute; top:12px; right:12px; padding:8px;">✕</button>
            <h3>Редактировать слово</h3>
            <div style="display:grid; gap:12px; margin:16px 0;">
              <div>
                <label style="display:block; margin-bottom:6px;">Слово</label>
                <input type="text" id="editWordText" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text);">
              </div>
              <div>
                <label style="display:block; margin-bottom:6px;">Описание</label>
                <textarea id="editWordDesc" rows="4" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-input); color:var(--text); resize:vertical;"></textarea>
              </div>
            </div>
            <button class="btn btn-full" id="saveWordEditBtn">Сохранить</button>
          </div>
        </div>
        
        <!-- Toast Container -->
        <div id="toastContainer" style="position:fixed; bottom:20px; right:20px; z-index:10000;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    // Re-initialize dictionaries functionality
    if (window.initDictionariesPage) {
      window.initDictionariesPage();
    }

    // Setup tab switching
    const tabs = modal.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.style.borderBottomColor = 'transparent';
          t.style.color = 'var(--text-secondary)';
        });
        tab.classList.add('active');
        tab.style.borderBottomColor = 'var(--primary)';
        tab.style.color = 'var(--text)';

        const tabId = tab.dataset.tab;
        modal.querySelectorAll('.tab-content').forEach(content => {
          content.hidden = content.id !== `tab-${tabId}`;
        });

        // Load data based on tab
        if (tabId === 'my-dictionaries' && window.loadMyDictionaries) {
          window.loadMyDictionaries();
        } else if (tabId === 'marketplace' && window.loadMarketplace) {
          window.loadMarketplace();
        }
      });
    });

    // Initialize first tab
    if (window.loadMyDictionaries) {
      window.loadMyDictionaries();
    }
  };

})();
