import { forwardRef } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { colorForDepartment } from '../utils/colors.js';

const DeskShape = forwardRef(function DeskShape(
  { desk, selected, dimmed, highlighted, editable, onClick, onDragEnd },
  ref
) {
  const fill = colorForDepartment(desk.department);
  const isEmpty = !desk.person;

  // Font scales with the desk's own size so a tiny desk still reads as a
  // label (just small) and a large private-office desk doesn't look
  // undersized — clamped at both ends so text never disappears or dwarfs
  // a normal-sized desk.
  const minSide = Math.min(desk.width, desk.height);
  const labelFontSize = clampFont(minSide * 0.32, 8, 22);
  const nameFontSize = clampFont(minSide * 0.26, 7, 18);

  return (
    <Group
      ref={ref}
      x={desk.x}
      y={desk.y}
      width={desk.width}
      height={desk.height}
      rotation={desk.rotation}
      draggable={editable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd?.(desk, { x: e.target.x(), y: e.target.y() })}
      opacity={dimmed ? 0.25 : 1}
    >
      <Rect
        width={desk.width}
        height={desk.height}
        fill={isEmpty ? '#e2e8f0' : fill}
        stroke={selected ? '#1d4ed8' : highlighted ? '#f97316' : '#334155'}
        strokeWidth={selected || highlighted ? 3 : 1}
        cornerRadius={4}
        shadowColor="black"
        shadowOpacity={selected ? 0.3 : 0}
        shadowBlur={6}
      />
      {desk.status !== 'active' && (
        <Rect width={desk.width} height={desk.height} fill="#000" opacity={0.15} cornerRadius={4} />
      )}
      <Text
        text={desk.label}
        width={desk.width}
        height={desk.height / 2}
        align="center"
        verticalAlign="middle"
        fontSize={labelFontSize}
        fontStyle="bold"
        fill={isEmpty ? '#334155' : '#ffffff'}
        listening={false}
        wrap="none"
        ellipsis
      />
      <Text
        text={desk.person ? desk.person.name : ''}
        y={desk.height / 2}
        width={desk.width}
        height={desk.height / 2}
        align="center"
        verticalAlign="middle"
        fontSize={nameFontSize}
        fill="#ffffff"
        listening={false}
        wrap="none"
        ellipsis
      />
    </Group>
  );
});

function clampFont(size, min, max) {
  return Math.min(max, Math.max(min, Math.round(size)));
}

export default DeskShape;
