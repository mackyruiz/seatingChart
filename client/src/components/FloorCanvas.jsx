import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from '../utils/useImage.js';
import DeskShape from './DeskShape.jsx';

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

export default function FloorCanvas({
  floor,
  desks,
  selectedIds,
  highlightedDeskId,
  departmentFilter,
  editable,
  placingDesk,
  onSelectDesk,
  onMoveDesk,
  onTransformDesk,
  onPlaceDesk,
  centerTarget,
}) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const deskNodeRefs = useRef({});
  const transformerRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [bgImage] = useImage(floor?.backgroundImage);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset the view (pan/zoom) whenever the floor changes.
  useEffect(() => {
    setView({ scale: 1, x: 40, y: 40 });
  }, [floor?.id]);

  // Attach/detach the resize+rotate transformer to the selected desk. Only
  // shown for a single selection — resizing several desks together via
  // drag handles would scale each into a different size, which fights the
  // "make them uniform" batch-resize flow in the side panel instead of
  // complementing it.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = editable && selectedIds.length === 1 ? deskNodeRefs.current[selectedIds[0]] : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, editable, desks]);

  // Center the view on a desk (used by search results). Keyed on `nonce` so
  // picking the same desk twice in a row still re-centers.
  useEffect(() => {
    if (!centerTarget) return;
    const desk = desks.find((d) => d.id === centerTarget.id);
    if (!desk) return;
    setView((prev) => ({
      scale: Math.max(prev.scale, 1),
      x: size.width / 2 - (desk.x + desk.width / 2) * Math.max(prev.scale, 1),
      y: size.height / 2 - (desk.y + desk.height / 2) * Math.max(prev.scale, 1),
    }));
  }, [centerTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    const oldScale = view.scale;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = clamp(oldScale * (1 + direction * 0.08), MIN_SCALE, MAX_SCALE);
    const mousePointTo = {
      x: (pointer.x - view.x) / oldScale,
      y: (pointer.y - view.y) / oldScale,
    };
    setView({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  function handleStageClick(e) {
    const stage = stageRef.current;
    const clickedOnEmpty = e.target === stage || e.target.id() === 'background-image';
    if (placingDesk && clickedOnEmpty) {
      const pointer = stage.getPointerPosition();
      const x = (pointer.x - view.x) / view.scale;
      const y = (pointer.y - view.y) / view.scale;
      onPlaceDesk({ x, y });
      return;
    }
    if (clickedOnEmpty) onSelectDesk(null);
  }

  const filteredDesks = useMemo(() => desks, [desks]);

  return (
    <div ref={containerRef} className={`floor-canvas ${placingDesk ? 'placing' : ''}`}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={!placingDesk}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setView((prev) => ({ ...prev, x: e.target.x(), y: e.target.y() }));
          }
        }}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer>
          {bgImage && (
            <KonvaImage id="background-image" image={bgImage} listening={false} opacity={0.9} />
          )}
        </Layer>
        <Layer>
          {filteredDesks.map((desk) => {
            const dimmed = departmentFilter && desk.department !== departmentFilter;
            return (
              <DeskShape
                key={desk.id}
                desk={desk}
                selected={selectedIds.includes(desk.id)}
                highlighted={highlightedDeskId === desk.id}
                dimmed={dimmed}
                editable={editable}
                onClick={(e) => {
                  e.cancelBubble = true;
                  const additive = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
                  onSelectDesk(desk.id, additive);
                }}
                onDragEnd={(d, pos) => onMoveDesk(d, pos)}
                ref={(node) => {
                  if (node) deskNodeRefs.current[desk.id] = node;
                }}
              />
            );
          })}
          {editable && (
            <Transformer
              ref={transformerRef}
              rotateEnabled
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 20 || newBox.height < 20) return oldBox;
                return newBox;
              }}
              onTransformEnd={(e) => {
                const node = e.target;
                const desk = desks.find((d) => d.id === selectedIds[0]);
                if (!desk) return;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);
                onTransformDesk(desk, {
                  x: node.x(),
                  y: node.y(),
                  width: Math.round(node.width() * scaleX),
                  height: Math.round(node.height() * scaleY),
                  rotation: Math.round(node.rotation()),
                });
              }}
            />
          )}
        </Layer>
      </Stage>
      <div className="canvas-hint">
        {placingDesk
          ? 'Click on the floor plan to place the new desk.'
          : 'Scroll to zoom, drag background to pan.'}
      </div>
    </div>
  );
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
