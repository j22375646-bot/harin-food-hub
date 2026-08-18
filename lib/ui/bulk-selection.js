'use strict';

function normalizeIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(value => value == null ? '' : String(value)).filter(Boolean))];
}

function reconcileSelection(selectedIds = [], availableIds = []) {
  const available = new Set(normalizeIds(availableIds));
  return normalizeIds(selectedIds).filter(id => available.has(id));
}

function toggleSelection(selectedIds = [], id, checked) {
  const target = id == null ? '' : String(id);
  if (!target) return normalizeIds(selectedIds);
  const selected = new Set(normalizeIds(selectedIds));
  const shouldSelect = checked == null ? !selected.has(target) : Boolean(checked);
  if (shouldSelect) selected.add(target);
  else selected.delete(target);
  return [...selected];
}

function selectionState(selectedIds = [], scopeIds = []) {
  const scope = normalizeIds(scopeIds);
  const selected = new Set(normalizeIds(selectedIds));
  const selectedCount = scope.reduce((total, id) => total + Number(selected.has(id)), 0);
  return {
    checked:scope.length > 0 && selectedCount === scope.length,
    mixed:selectedCount > 0 && selectedCount < scope.length,
    selectedCount,
    totalCount:scope.length
  };
}

function toggleSelectionScope(selectedIds = [], scopeIds = [], checked) {
  const selected = new Set(normalizeIds(selectedIds));
  const scope = normalizeIds(scopeIds);
  const state = selectionState([...selected], scope);
  const shouldSelect = checked == null ? !state.checked : Boolean(checked);
  for (const id of scope) {
    if (shouldSelect) selected.add(id);
    else selected.delete(id);
  }
  return [...selected];
}

module.exports = { normalizeIds, reconcileSelection, selectionState, toggleSelection, toggleSelectionScope };
