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

export const G: React.FC<any> = ({ x, y, opacity, onPress, onClick, children, ...rest }) => (
  <g
    transform={x !== undefined || y !== undefined ? `translate(${x || 0}, ${y || 0})` : undefined}
    opacity={opacity}
    onClick={onPress || onClick}
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

export const Circle: React.FC<any> = ({ cx, cy, r, fill, stroke, strokeWidth, strokeDasharray, strokeOpacity, fillOpacity, onPress, onClick, ...rest }) => (
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

export const Text: React.FC<any> = ({ x, y, textAnchor, fontSize, fontWeight, fill, children, ...rest }) => (
  <text
    x={x}
    y={y}
    textAnchor={textAnchor}
    fontSize={fontSize}
    fontWeight={fontWeight}
    fill={fill}
    dominantBaseline="middle"
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
