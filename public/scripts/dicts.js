(function(global){
  const target = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
  const INDEX_PATH = './dicts/index.json';
  const DIFF_LABELS = { easy:'Лёгкий', medium:'Средний', hard:'Сложный' };
  let indexPromise = null;
  const dictionaryCache = new Map();

  function normalizeDictionary(raw){
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : id;
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    const rawDiffs = raw.difficulties && typeof raw.difficulties === 'object' ? raw.difficulties : {};
    const difficulties = {};
    Object.keys(rawDiffs).forEach(key => {
      const info = rawDiffs[key];
      if (!info || typeof info !== 'object') return;
      const path = typeof info.path === 'string' ? info.path.trim() : '';
      if (!path) return;
      const label = typeof info.label === 'string' && info.label.trim() ? info.label.trim() : (DIFF_LABELS[key] || key);
      difficulties[key] = { path, label };
    });
    if (!Object.keys(difficulties).length) return null;
    return { id, title, description, difficulties };
  }

  function loadIndex(){
    if (indexPromise) return indexPromise;
    indexPromise = fetch(INDEX_PATH, { cache:'no-cache' })
      .then(resp => {
        if (!resp.ok) throw new Error(`Не удалось загрузить index.json (${resp.status})`);
        return resp.json();
      })
      .then(data => {
        const list = Array.isArray(data?.dictionaries) ? data.dictionaries : [];
        return list.map(normalizeDictionary).filter(Boolean);
      })
      .catch(err => {
        console.error('Не удалось загрузить список словарей:', err);
        return [];
      });
    return indexPromise;
  }

  function cacheKey(dictId, diff){
    return `${dictId}::${diff}`;
  }

  const TABLE_COLUMN_ALIASES = {
    id: ['id', 'identifier', 'код', 'ид'],
    term: ['term', 'word', 'слово'],
    description: ['description', 'meaning', 'definition', 'описание', 'значение'],
    about: ['about', 'hint', 'notes', 'подсказка', 'жест', 'действие']
  };

  function findColumnIndex(cells, aliases){
    if (!Array.isArray(cells) || !Array.isArray(aliases)) return -1;
    for (let i = 0; i < aliases.length; i++){
      const idx = cells.indexOf(aliases[i]);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function isSeparatorRow(cells){
    if (!Array.isArray(cells) || !cells.length) return false;
    return cells.every(cell => /^:?[-]{2,}:?$/.test(cell.replace(/\s+/g, '')));
  }

  function parseMarkdownTable(text){
    const rows = [];
    const lines = String(text || '').split(/\r?\n/);
    let header = null;
    let headerRaw = null;
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) return;
      const cells = trimmed.split('|').slice(1, -1).map(cell => cell.trim());
      if (!cells.length) return;
      if (isSeparatorRow(cells)) return;
      const lowerCells = cells.map(cell => cell.toLowerCase());
      if (!header){
        const termIndex = findColumnIndex(lowerCells, TABLE_COLUMN_ALIASES.term);
        if (termIndex === -1) return;
        header = {
          id: findColumnIndex(lowerCells, TABLE_COLUMN_ALIASES.id),
          term: termIndex,
          description: findColumnIndex(lowerCells, TABLE_COLUMN_ALIASES.description),
          about: findColumnIndex(lowerCells, TABLE_COLUMN_ALIASES.about)
        };
        headerRaw = lowerCells;
        return;
      }
      if (headerRaw && lowerCells.length === headerRaw.length && lowerCells.every((cell, idx) => cell === headerRaw[idx])){
        return;
      }
      const termCell = header.term >= 0 ? cells[header.term] : (cells[0] || '');
      if (!termCell || !termCell.trim()) return;
      const row = {
        id: header.id >= 0 ? (cells[header.id] || '').trim() : '',
        term: termCell.trim(),
        description: header.description >= 0 ? (cells[header.description] || '').trim() : '',
        about: header.about >= 0 ? (cells[header.about] || '').trim() : ''
      };
      rows.push(row);
    });
    return rows;
  }

  function shuffleEntries(list){
    if (!Array.isArray(list)) return [];
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function loadDictionary(dict, diff){
    const def = dict?.difficulties?.[diff];
    if (!def) throw new Error(`Уровень сложности «${diff}» не найден для словаря «${dict?.id ?? 'unknown'}».`);
    const key = cacheKey(dict.id, diff);
    if (!dictionaryCache.has(key)){
      dictionaryCache.set(key,
        fetch(`./dicts/${def.path}`, { cache:'no-cache' })
          .then(resp => {
            if (!resp.ok) throw new Error(`Не удалось загрузить словарь ${def.path} (${resp.status})`);
            return resp.text();
          })
          .then(text => {
            const parsed = parseMarkdownTable(text);
            return parsed.map((entry, idx) => ({
              dictionaryId: dict.id,
              difficulty: diff,
              id: entry.id || `${dict.id}_${diff}_${idx+1}`,
              term: entry.term,
              description: entry.description,
              about: entry.about
            }));
          })
          .catch(err => {
            dictionaryCache.delete(key);
            throw err;
          })
      );
    }
    return dictionaryCache.get(key);
  }

  async function getWords(dictId, diff){
    const list = await loadIndex();
    const dict = list.find(item => item.id === dictId);
    if (!dict) throw new Error(`Словарь «${dictId}» не найден.`);
    if (diff === 'mix'){
      const keys = Object.keys(dict.difficulties);
      if (!keys.length) return [];
      const batches = await Promise.all(keys.map(key => loadDictionary(dict, key).catch(err => {
        console.error(`Ошибка загрузки словаря ${dict.id}/${key}:`, err);
        return [];
      })));
      return shuffleEntries(batches.flat());
    }
    return loadDictionary(dict, diff);
  }

  target.DictionaryService = {
    getDictionaries: loadIndex,
    getWords
  };

  if (typeof module !== 'undefined' && module.exports){
    module.exports = target.DictionaryService;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
