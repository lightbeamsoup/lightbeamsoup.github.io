const pageSize = 40;

export function setupHistory({el, $}) {
  const source = $('history-source'), search = $('history-search'), type = $('history-type');
  let data = null, limit = pageSize;

  function render() {
    const isLedger = source.value === 'transactions';
    $('activity-label').hidden = !isLedger;
    const query = search.value.trim().toLocaleLowerCase();
    const entries = (data?.[source.value] || []).filter(entry =>
      (!isLedger || !type.value || entry.type === type.value) &&
      (!query || [entry.title, entry.wineId, entry.date, entry.type, ...Object.values(entry.details)]
        .join(' ').toLocaleLowerCase().includes(query)));
    const visible = entries.slice(0,limit);
    const list = $('history-list');
    list.replaceChildren();
    $('history-count').textContent = data ? visible.length + ' of ' + entries.length + ' entries' : '';
    $('history-more').hidden = visible.length >= entries.length;
    if (data && !entries.length) list.append(el('p', query || (isLedger && type.value) ?
      'No entries match these filters.' : 'No entries recorded yet.', 'empty'));

    let group, lastDate;
    for (const entry of visible) {
      const date = entry.date || 'Date unrecorded';
      if (date !== lastDate) {
        group = el('section', null, 'history-day');
        group.append(el('h2', date));
        list.append(group);
        lastDate = date;
      }
      const item = el('details', null, 'history-entry');
      const summary = el('summary'), title = el('strong', entry.title);
      const quantity = entry.quantity ? entry.quantity + (entry.quantity === '1' ? ' bottle' : ' bottles') : '';
      const subtitle = isLedger ? [entry.type, quantity].filter(Boolean).join(' · ') :
        entry.details['Tasting Notes'] || entry.details.Notes || 'Tasting recorded';
      summary.append(title, el('span', subtitle, 'entry-activity'));
      const fields = el('dl', null, 'entry-fields');
      for (const [label, value] of Object.entries({'Wine ID':entry.wineId, ...entry.details})) {
        if (value) fields.append(el('dt',label), el('dd',value));
      }
      item.append(summary, fields);
      group.append(item);
    }
  }

  function resetPage() { limit = pageSize; render(); }
  source.onchange = resetPage;
  search.oninput = resetPage;
  type.onchange = resetPage;
  $('history-more').onclick = () => { limit += pageSize; render(); };

  return {
    update(next) {
      if (JSON.stringify(data) === JSON.stringify(next)) return;
      data = next;
      const selected = type.value;
      const activities = [...new Set(data.transactions.map(entry => entry.type))].sort();
      type.replaceChildren(new Option('All activities',''), ...activities.map(name => new Option(name,name)));
      if (activities.includes(selected)) type.value = selected;
      render();
    },
    clear() {
      data = null;
      source.value = 'transactions';
      search.value = '';
      type.replaceChildren(new Option('All activities',''));
      $('history-status').textContent = '';
      resetPage();
    }
  };
}
