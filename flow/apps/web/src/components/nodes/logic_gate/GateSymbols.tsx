/**
 * SVG components for standard IEEE/ANSI logic gate symbols.
 * Each symbol fits in an 80×50 viewBox with input pins on the left
 * (y=15 and y=35) and output pin on the right (y=25).
 */
import type { JSX } from 'react'

const baseStyle = {
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

function ANDShape(props: { color: string }) {
  // D-shape: flat back, rounded front
  return (
    <path
      d="M 15 8 L 35 8 A 17 17 0 0 1 35 42 L 15 42 Z"
      fill="none"
      stroke={props.color}
      strokeWidth={2}
      style={baseStyle}
    />
  )
}

function ORShape(props: { color: string }) {
  // Curved back, pointed front
  return (
    <path
      d="M 12 8 Q 24 25 12 42 Q 35 42 55 25 Q 35 8 12 8 Z"
      fill="none"
      stroke={props.color}
      strokeWidth={2}
      style={baseStyle}
    />
  )
}

function XORShape(props: { color: string }) {
  // OR + extra arc on the back
  return (
    <>
      <path
        d="M 8 8 Q 20 25 8 42"
        fill="none"
        stroke={props.color}
        strokeWidth={2}
        style={baseStyle}
      />
      <path
        d="M 14 8 Q 26 25 14 42 Q 37 42 57 25 Q 37 8 14 8 Z"
        fill="none"
        stroke={props.color}
        strokeWidth={2}
        style={baseStyle}
      />
    </>
  )
}

function NOTShape(props: { color: string }) {
  // Triangle (inverter)
  return (
    <path
      d="M 15 8 L 15 42 L 50 25 Z"
      fill="none"
      stroke={props.color}
      strokeWidth={2}
      style={baseStyle}
    />
  )
}

function Bubble(props: { color: string; cx: number; cy?: number }) {
  return <circle cx={props.cx} cy={props.cy ?? 25} r={3} fill="none" stroke={props.color} strokeWidth={2} />
}

function Pins(props: { color: string; single?: boolean }) {
  return (
    <>
      {props.single ? (
        <line x1={2} y1={25} x2={15} y2={25} stroke={props.color} strokeWidth={2} />
      ) : (
        <>
          <line x1={2} y1={15} x2={15} y2={15} stroke={props.color} strokeWidth={2} />
          <line x1={2} y1={35} x2={15} y2={35} stroke={props.color} strokeWidth={2} />
        </>
      )}
    </>
  )
}

const COLORS: Record<string, string> = {
  // Unified palette — all gates use violet; subtle hue variation keeps
  // visual distinction without flooding the canvas with colors.
  gate_and:  '#a78bfa',  // violet-400
  gate_or:   '#a78bfa',
  gate_not:  '#a78bfa',
  gate_nand: '#c4b5fd',  // violet-300 (lighter for NOT-variants)
  gate_nor:  '#c4b5fd',
  gate_xor:  '#a78bfa',
  gate_xnor: '#c4b5fd',
}

export function GateSymbol({ type, className }: { type: string; className?: string }) {
  const color = COLORS[type] ?? '#a1a1aa'
  let body: JSX.Element

  switch (type) {
    case 'gate_and':
      body = (
        <>
          <Pins color={color} />
          <ANDShape color={color} />
          <line x1={52} y1={25} x2={68} y2={25} stroke={color} strokeWidth={2} />
        </>
      )
      break
    case 'gate_nand':
      body = (
        <>
          <Pins color={color} />
          <ANDShape color={color} />
          <Bubble color={color} cx={55} />
          <line x1={58} y1={25} x2={70} y2={25} stroke={color} strokeWidth={2} />
        </>
      )
      break
    case 'gate_or':
      body = (
        <>
          <Pins color={color} />
          <ORShape color={color} />
          <line x1={55} y1={25} x2={70} y2={25} stroke={color} strokeWidth={2} />
        </>
      )
      break
    case 'gate_nor':
      body = (
        <>
          <Pins color={color} />
          <ORShape color={color} />
          <Bubble color={color} cx={58} />
          <line x1={61} y1={25} x2={72} y2={25} stroke={color} strokeWidth={2} />
        </>
      )
      break
    case 'gate_xor':
      body = (
        <>
          <Pins color={color} />
          <XORShape color={color} />
          <line x1={57} y1={25} x2={70} y2={25} stroke={color} strokeWidth={2} />
        </>
      )
      break
    case 'gate_xnor':
      body = (
        <>
          <Pins color={color} />
          <XORShape color={color} />
          <Bubble color={color} cx={60} />
          <line x1={63} y1={25} x2={72} y2={25} stroke={color} strokeWidth={2} />
        </>
      )
      break
    case 'gate_not':
      body = (
        <>
          <Pins color={color} single />
          <NOTShape color={color} />
          <Bubble color={color} cx={53} />
          <line x1={56} y1={25} x2={68} y2={25} stroke={color} strokeWidth={2} />
        </>
      )
      break
    default:
      body = <text x={36} y={30} fill={color} fontSize={12} textAnchor="middle">?</text>
  }

  return (
    <svg viewBox="0 0 75 50" className={className} preserveAspectRatio="xMidYMid meet">
      {body}
    </svg>
  )
}
