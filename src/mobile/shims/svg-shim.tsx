/**
 * React Native SVG Shim for Web Bundler (Vite / react-native-web)
 * Maps React Native SVG primitives to HTML5 SVG elements so that React Native
 * components can be rendered natively in web previews and mobile simulators.
 */

import React from 'react';

export const Svg: React.FC<any> = ({ width, height, viewBox, style, children, ...rest }) => (
  <svg
    width={width}
    height={height}
    viewBox={viewBox || `0 0 ${width} ${height}`}
    style={{ display: 'block', overflow: 'hidden', ...style }}
    {...rest}
  >
    {children}
  </svg>
);

// `onPressIn` fires the moment the pointer goes down, before any click: it is
// what lets a drag begin on the element that was actually grabbed. React Native
// SVG shapes support it natively, so callers can use it on both platforms.
export const G: React.FC<any> = ({ x, y, opacity, onPress, onPressIn, onClick, children, ...rest }) => (
  <g
    transform={x !== undefined || y !== undefined ? `translate(${x || 0}, ${y || 0})` : undefined}
    opacity={opacity}
    onClick={onPress || onClick}
    onMouseDown={onPressIn}
    onTouchStart={onPressIn}
    style={{ cursor: onPress || onClick ? 'pointer' : 'default' }}
    {...rest}
  >
    {children}
  </g>
);

export const Line: React.FC<any> = ({ x1, y1, x2, y2, stroke, strokeWidth, strokeLinecap, ...rest }) => (
  <line
    x1={x1}
    y1={y1}
    x2={x2}
    y2={y2}
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap={strokeLinecap}
    {...rest}
  />
);

export const Circle: React.FC<any> = ({ cx, cy, r, fill, stroke, strokeWidth, strokeDasharray, strokeOpacity, fillOpacity, onPress, onPressIn, onClick, ...rest }) => (
  <circle
    cx={cx}
    cy={cy}
    r={r}
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeDasharray={strokeDasharray}
    strokeOpacity={strokeOpacity}
    fillOpacity={fillOpacity}
    onClick={onPress || onClick}
    onMouseDown={onPressIn}
    onTouchStart={onPressIn}
    style={{ cursor: onPress || onClick ? 'pointer' : 'inherit' }}
    {...rest}
  />
);

export const Rect: React.FC<any> = ({ x, y, width, height, rx, ry, fill, stroke, strokeWidth, ...rest }) => (
  <rect
    x={x}
    y={y}
    width={width}
    height={height}
    rx={rx}
    ry={ry || rx}
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    {...rest}
  />
);

// `alignmentBaseline` decides what `y` means. It defaults to "middle" (y is the
// text's vertical centre) because that is what the callers here want and what
// they were written against; passing it explicitly lets a caller ask for the SVG
// default of baseline positioning instead.
export const Text: React.FC<any> = ({
  x,
  y,
  textAnchor,
  fontSize,
  fontWeight,
  fill,
  alignmentBaseline,
  children,
  ...rest
}) => (
  <text
    x={x}
    y={y}
    textAnchor={textAnchor}
    fontSize={fontSize}
    fontWeight={fontWeight}
    fill={fill}
    dominantBaseline={alignmentBaseline || 'middle'}
    {...rest}
  >
    {children}
  </text>
);

export const Polygon: React.FC<any> = ({ points, fill, stroke, strokeWidth, ...rest }) => (
  <polygon
    points={points}
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    {...rest}
  />
);

export const Path: React.FC<any> = ({ d, fill, stroke, strokeWidth, ...rest }) => (
  <path
    d={d}
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    {...rest}
  />
);

export default Svg;
