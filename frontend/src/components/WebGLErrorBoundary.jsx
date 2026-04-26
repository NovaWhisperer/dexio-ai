import { Component } from "react"

export class WebGLErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.warn("WebGL or 3D rendering failed, falling back:", error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          position: "fixed", inset: 0, zIndex: 0,
          background: "#09090b", pointerEvents: "none"
        }} />
      )
    }
    return this.props.children
  }
}