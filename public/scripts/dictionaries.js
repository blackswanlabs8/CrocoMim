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

  // My Dictionaries
  async function loadMyDictionaries() {
    if (!elements.myDictionariesGrid) return;
    
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

})();
