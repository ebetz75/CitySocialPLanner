import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const createItem = (type, overrides = {}) => ({
  id: crypto.randomUUID(),
  type,
  label: type === 'round' ? 'Round table' : 'Rectangle',
  x: 120,
  y: 120,
  w: type === 'round' ? 5 : 8,
  h: type === 'round' ? 5 : 4,
  angle: 0,
  color: `hsl(${Math.random() * 360} 70% 82%)`,
  ...overrides,
});

const serializeState = (items, pxPerFoot) => JSON.stringify({ items, pxPerFoot });

const drawBackgroundImage = (context, image, width, height) => {
  if (!image) return;

  const imageRatio = image.width / image.height;
  const canvasRatio = width / height;

  let drawWidth;
  let drawHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (imageRatio > canvasRatio) {
    drawWidth = width;
    drawHeight = width / imageRatio;
    offsetY = (height - drawHeight) / 2;
  } else {
    drawHeight = height;
    drawWidth = height * imageRatio;
    offsetX = (width - drawWidth) / 2;
  }

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
};

const getItemBounds = (item, pxPerFoot) => ({
  x: item.x,
  y: item.y,
  width: item.w * pxPerFoot,
  height: item.h * pxPerFoot,
});

const pointInsideItem = (x, y, item, pxPerFoot) => {
  const { x: left, y: top, width, height } = getItemBounds(item, pxPerFoot);

  if (item.type === 'round') {
    const cx = left + width / 2;
    const cy = top + height / 2;
    const radius = Math.min(width, height) / 2;
    return Math.hypot(x - cx, y - cy) <= radius;
  }

  return x >= left && x <= left + width && y >= top && y <= top + height;
};

function PlannerApp() {
  const canvasRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const loadInputRef = React.useRef(null);

  const [items, setItems] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [snapToGrid, setSnapToGrid] = React.useState(true);
  const [pxPerFoot, setPxPerFoot] = React.useState(28);
  const [scaleMode, setScaleMode] = React.useState(false);
  const [scaleDraft, setScaleDraft] = React.useState([]);
  const [scaleValue, setScaleValue] = React.useState('10');
  const [scaleModalOpen, setScaleModalOpen] = React.useState(false);
  const [libraryDraft, setLibraryDraft] = React.useState({
    type: 'rectangle',
    label: 'Rectangle',
    width: 8,
    height: 4,
  });
  const [history, setHistory] = React.useState([serializeState(items, pxPerFoot)]);
  const [redoStack, setRedoStack] = React.useState([]);
  const [backgroundImage, setBackgroundImage] = React.useState(null);

  const selectedItem = React.useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const pushHistory = React.useCallback((nextItems, nextPxPerFoot) => {
    const snapshot = serializeState(nextItems, nextPxPerFoot);
    setHistory((prev) => {
      if (prev[prev.length - 1] === snapshot) return prev;
      const updated = [...prev, snapshot];
      return updated.length > 60 ? updated.slice(updated.length - 60) : updated;
    });
    setRedoStack([]);
  }, []);

  const restoreFromSnapshot = React.useCallback((snapshotText) => {
    try {
      const parsed = JSON.parse(snapshotText);
      setItems(parsed.items || []);
      setPxPerFoot(Number(parsed.pxPerFoot) || 28);
    } catch (error) {
      console.error('Failed to restore state', error);
    }
  }, []);

  const undo = React.useCallback(() => {
    setHistory((prev) => {
      if (prev.length <= 1) return prev;
      const nextHistory = [...prev];
      const current = nextHistory.pop();
      setRedoStack((rd) => [...rd, current]);
      restoreFromSnapshot(nextHistory[nextHistory.length - 1]);
      return nextHistory;
    });
  }, [restoreFromSnapshot]);

  const redo = React.useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const snapshotText = next.pop();
      setHistory((h) => [...h, snapshotText]);
      restoreFromSnapshot(snapshotText);
      return next;
    });
  }, [restoreFromSnapshot]);

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');

    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(800, rect.width - 16);
    const height = Math.max(620, rect.height - 16 || 620);

    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);

    if (backgroundImage) {
      drawBackgroundImage(context, backgroundImage, width, height);
    }

    if (snapToGrid) {
      context.save();
      context.strokeStyle = 'rgba(15, 23, 42, 0.06)';
      context.lineWidth = 1;

      for (let x = 0; x <= width; x += pxPerFoot) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      for (let y = 0; y <= height; y += pxPerFoot) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.restore();
    }

    items.forEach((item) => {
      const { x, y, width: itemWidth, height: itemHeight } = getItemBounds(item, pxPerFoot);
      const isSelected = item.id === selectedId;

      context.save();
      context.translate(x + itemWidth / 2, y + itemHeight / 2);
      context.rotate((item.angle || 0) * (Math.PI / 180));

      context.fillStyle = item.color;
      context.strokeStyle = isSelected ? '#2563eb' : '#1f2937';
      context.lineWidth = isSelected ? 3 : 1.5;

      if (item.type === 'round') {
        const radius = Math.min(itemWidth, itemHeight) / 2;
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      } else {
        context.fillRect(-itemWidth / 2, -itemHeight / 2, itemWidth, itemHeight);
        context.strokeRect(-itemWidth / 2, -itemHeight / 2, itemWidth, itemHeight);
      }
      context.restore();

      context.save();
      context.font = '600 12px Inter, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#111827';
      context.fillText(item.label || '', x + itemWidth / 2, y + itemHeight / 2);
      context.restore();
    });

    if (scaleMode && scaleDraft.length === 1) {
      const point = scaleDraft[0];
      context.save();
      context.strokeStyle = '#ef4444';
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.restore();
    }
  }, [backgroundImage, items, pxPerFoot, scaleDraft, scaleMode, selectedId, snapToGrid]);

  React.useEffect(() => {
    draw();
  }, [draw]);

  const addItem = React.useCallback((type, config = {}) => {
    const draftType = type || libraryDraft.type;
    const nextItem = createItem(draftType, {
      label: config.label || (draftType === 'round' ? 'Round table' : 'Rectangle'),
      w: Number(config.width ?? (draftType === 'round' ? 5 : libraryDraft.width || 8)),
      h: Number(config.height ?? (draftType === 'round' ? 5 : libraryDraft.height || 4)),
    });
    const nextItems = [...items, nextItem];
    setItems(nextItems);
    setSelectedId(nextItem.id);
    pushHistory(nextItems, pxPerFoot);
  }, [items, libraryDraft, pxPerFoot, pushHistory]);

  const updateSelectedItem = React.useCallback((changes) => {
    if (!selectedItem) return;
    const nextItems = items.map((item) => {
      if (item.id !== selectedItem.id) return item;
      return { ...item, ...changes };
    });
    setItems(nextItems);
    pushHistory(nextItems, pxPerFoot);
  }, [items, pxPerFoot, pushHistory, selectedItem]);

  const deleteSelected = React.useCallback(() => {
    if (!selectedItem) return;
    const nextItems = items.filter((item) => item.id !== selectedItem.id);
    setItems(nextItems);
    setSelectedId(null);
    pushHistory(nextItems, pxPerFoot);
  }, [items, pxPerFoot, pushHistory, selectedItem]);

  const dragState = React.useRef(null);

  const handlePointerDown = React.useCallback((event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (scaleMode) {
      setScaleDraft((prev) => {
        const next = [...prev, { x, y }];
        if (next.length === 2) {
          setScaleMode(false);
          setScaleModalOpen(true);
          return next;
        }
        return next;
      });
      return;
    }

    let hit = null;

    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (pointInsideItem(x, y, item, pxPerFoot)) {
        hit = item;
        break;
      }
    }

    if (hit) {
      setSelectedId(hit.id);
      const item = items.find((entry) => entry.id === hit.id);
      dragState.current = {
        itemId: item.id,
        offsetX: x - item.x,
        offsetY: y - item.y,
      };
    } else {
      setSelectedId(null);
      dragState.current = null;
    }
  }, [items, pxPerFoot, pushHistory, scaleMode, scaleValue]);

  const handlePointerMove = React.useCallback((event) => {
    if (!dragState.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const activeItem = items.find((item) => item.id === dragState.current.itemId);
    if (!activeItem) return;

    let nextX = x - dragState.current.offsetX;
    let nextY = y - dragState.current.offsetY;

    if (snapToGrid) {
      nextX = Math.round(nextX / pxPerFoot) * pxPerFoot;
      nextY = Math.round(nextY / pxPerFoot) * pxPerFoot;
    }

    setItems((prev) => prev.map((item) => {
      if (item.id !== activeItem.id) return item;
      return {
        ...item,
        x: clamp(nextX, 0, canvas.width - item.w * pxPerFoot),
        y: clamp(nextY, 0, canvas.height - item.h * pxPerFoot),
      };
    }));
  }, [items, pxPerFoot, snapToGrid]);

  const handlePointerUp = React.useCallback(() => {
    if (dragState.current) {
      pushHistory(items, pxPerFoot);
      dragState.current = null;
    }
  }, [items, pxPerFoot, pushHistory]);

  const handleLoadLayout = React.useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (Array.isArray(parsed.items)) {
          const nextItems = parsed.items;
          const nextPx = Number(parsed.pxPerFoot) || pxPerFoot;
          setItems(nextItems);
          setPxPerFoot(nextPx);
          setSelectedId(null);
          pushHistory(nextItems, nextPx);
        }
      } catch (error) {
        console.error('Invalid layout JSON', error);
      }
    };
    reader.readAsText(file);
  }, [pxPerFoot, pushHistory]);

  const handleSaveLayout = React.useCallback(() => {
    const payload = JSON.stringify({ items, pxPerFoot }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'layout.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [items, pxPerFoot]);

  const handleDownloadPNG = React.useCallback(() => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'layout.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(800, rect.width - 16);
      const height = Math.max(620, rect.height - 16 || 620);
      canvas.width = width;
      canvas.height = height;
      draw();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, sans-serif;
          background: #f3f4f6;
          color: #111827;
        }
        button, input { font: inherit; }
        .planner-app { max-width: 1440px; margin: 0 auto; padding: 24px; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
        .title h1 { margin: 0; font-size: clamp(2rem, 3vw, 2.7rem); font-weight: 800; }
        .title .accent { color: #2563eb; }
        .subtitle { margin-top: 6px; color: #6b7280; font-size: 0.9rem; }
        .controls { display: flex; gap: 10px; flex-wrap: wrap; }
        .btn { appearance: none; border: 1px solid #d1d5db; background: white; color: #111827; border-radius: 10px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
        .btn.primary { background: #2563eb; border-color: #2563eb; color: white; }
        .btn.danger { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
        .layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 20px; }
        .sidebar { display: flex; flex-direction: column; gap: 18px; }
        .panel { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04); }
        .panel h2 { margin: 0 0 14px; font-size: 0.76rem; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; }
        .stack { display: flex; flex-direction: column; gap: 10px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .field { display: flex; flex-direction: column; gap: 6px; font-weight: 600; color: #374151; font-size: 0.82rem; }
        .input { width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 10px; font-size: 0.95rem; }
        .canvas-wrap { position: relative; background: white; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; min-height: 720px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04); }
        canvas { display: block; width: 100%; height: 100%; min-height: 720px; background: #fafafa; cursor: crosshair; }
        .statusbar { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #6b7280; font-size: 0.8rem; flex-wrap: wrap; }
        .badge { display: inline-flex; align-items: center; padding: 6px 10px; background: #f3f4f6; border-radius: 999px; color: #374151; font-weight: 600; }
        .hidden { display: none !important; }
        .modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.55); z-index: 100; }
        .modal-card { width: min(420px, calc(100vw - 32px)); background: white; border-radius: 16px; padding: 24px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2); }
        .modal-card h3 { margin: 0 0 10px; font-size: 1.4rem; }
        .modal-card p { margin: 0 0 16px; color: #6b7280; }
        .modal-actions { margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px; }
        @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } .canvas-wrap, canvas { min-height: 520px; } }
      `}</style>

      <div className="planner-app">
        <header className="toolbar">
          <div className="title">
            <h1>City Social <span className="accent">Floor Planner</span></h1>
            <div className="subtitle">Design, scale, and export event layouts.</div>
          </div>

          <div className="controls">
            <button className="btn" onClick={undo} disabled={history.length <= 1}>Undo</button>
            <button className="btn" onClick={redo} disabled={redoStack.length === 0}>Redo</button>
          </div>
        </header>

        <div className="layout">
          <aside className="sidebar">
            <section className="panel">
              <h2>Project</h2>
              <div className="stack">
                <button className="btn primary" onClick={() => fileInputRef.current?.click()}>Upload floor plan</button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const img = new Image();
                    img.onload = () => setBackgroundImage(img);
                    img.src = reader.result;
                  };
                  reader.readAsDataURL(file);
                }} />

                <button className="btn" onClick={() => {
                  setScaleDraft([]);
                  setScaleValue('10');
                  setScaleMode(true);
                  setScaleModalOpen(false);
                }}>
                  Define scale
                </button>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <span>Snap to grid</span>
                  <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
                </label>
              </div>
            </section>

            <section className="panel">
              <h2>Library</h2>
              <div className="stack">
                <label className="field">
                  <span>Library type</span>
                  <select
                    className="input"
                    value={libraryDraft.type}
                    onChange={(event) => setLibraryDraft((prev) => ({ ...prev, type: event.target.value }))}
                  >
                    <option value="rectangle">Rectangle</option>
                    <option value="round">Round</option>
                  </select>
                </label>

                <label className="field">
                  <span>Label</span>
                  <input
                    className="input"
                    value={libraryDraft.label}
                    onChange={(event) => setLibraryDraft((prev) => ({ ...prev, label: event.target.value }))}
                  />
                </label>

                <div className="grid2">
                  <label className="field">
                    <span>{libraryDraft.type === 'round' ? 'Diameter' : 'Width'}</span>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={libraryDraft.type === 'round' ? libraryDraft.width : libraryDraft.width}
                      onChange={(event) => {
                        const value = clamp(Number(event.target.value) || 1, 1, 80);
                        setLibraryDraft((prev) => ({ ...prev, width: value, height: prev.type === 'round' ? value : prev.height }));
                      }}
                    />
                  </label>

                  {libraryDraft.type !== 'round' && (
                    <label className="field">
                      <span>Height</span>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={libraryDraft.height}
                        onChange={(event) => {
                          const value = clamp(Number(event.target.value) || 1, 1, 80);
                          setLibraryDraft((prev) => ({ ...prev, height: value }));
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="grid2">
                  <button className="btn" onClick={() => addItem('rectangle', {
                    label: libraryDraft.label,
                    width: libraryDraft.width,
                    height: libraryDraft.height,
                  })}>Add rectangle</button>
                  <button className="btn" onClick={() => addItem('round', {
                    label: libraryDraft.label,
                    width: libraryDraft.width,
                    height: libraryDraft.width,
                  })}>Add round</button>
                </div>
              </div>
            </section>

            {selectedItem && (
              <section className="panel">
                <h2>Inspector</h2>
                <div className="stack">
                  <label className="field">
                    <span>Label</span>
                    <input
                      className="input"
                      value={selectedItem.label}
                      onChange={(event) => updateSelectedItem({ label: event.target.value })}
                    />
                  </label>

                  <div className="grid2">
                    <label className="field">
                      <span>{selectedItem.type === 'round' ? 'Diameter' : 'Width'}</span>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={selectedItem.w}
                        onChange={(event) => {
                          const value = clamp(Number(event.target.value) || 1, 1, 80);
                          if (selectedItem.type === 'round') {
                            updateSelectedItem({ w: value, h: value });
                          } else {
                            updateSelectedItem({ w: value });
                          }
                        }}
                      />
                    </label>

                    {selectedItem.type !== 'round' && (
                      <label className="field">
                        <span>Height</span>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          value={selectedItem.h}
                          onChange={(event) => {
                            const value = clamp(Number(event.target.value) || 1, 1, 80);
                            updateSelectedItem({ h: value });
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <label className="field">
                    <span>Rotation {selectedItem.angle}°</span>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={selectedItem.angle}
                      onChange={(event) => updateSelectedItem({ angle: Number(event.target.value) || 0 })}
                    />
                  </label>

                  <button className="btn danger" onClick={deleteSelected}>Delete item</button>
                </div>
              </section>
            )}

            <section className="panel">
              <h2>Save / Load</h2>
              <div className="stack">
                <button className="btn primary" onClick={handleSaveLayout}>Save layout</button>
                <button className="btn" onClick={() => loadInputRef.current?.click()}>Load layout</button>
                <input ref={loadInputRef} type="file" accept=".json" className="hidden" onChange={handleLoadLayout} />
              </div>
            </section>
          </aside>

          <main>
            <div
              className="canvas-wrap"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <canvas
                ref={canvasRef}
              />
            </div>

            <div className="statusbar">
              <div>
                <span>Drag to position • Delete to remove</span>
                <span className="badge">Scale: {pxPerFoot.toFixed(1)} px/ft</span>
              </div>
              <button className="btn" onClick={handleDownloadPNG}>Download PNG</button>
            </div>
          </main>
        </div>
      </div>

      {scaleModalOpen && (
        <div className="modal" onClick={() => setScaleModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Set real-world distance</h3>
            <p>Click two points on the canvas separated by a known distance in feet.</p>
            <input
              className="input"
              type="number"
              min="1"
              value={scaleValue}
              onChange={(event) => setScaleValue(event.target.value)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => {
                setScaleMode(false);
                setScaleDraft([]);
                setScaleModalOpen(false);
              }}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => {
                if (scaleDraft.length >= 2) {
                  const [a, b] = scaleDraft;
                  const distance = Math.hypot(b.x - a.x, b.y - a.y);
                  const feet = Number(scaleValue) || 10;
                  if (feet > 0 && distance > 0) {
                    const nextPx = distance / feet;
                    setPxPerFoot(nextPx);
                    setScaleMode(false);
                    setScaleDraft([]);
                    setScaleModalOpen(false);
                    pushHistory(items, nextPx);
                  }
                }
              }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlannerApp />
  </React.StrictMode>,
);
