interface Props {
  connected: boolean
}

export default function Topbar({ connected }: Props) {
  return (
    <div className="topbar">
      <div className="topbar-spacer" />
      {/* Connection status */}
      <div className={`topbar-status ${connected ? 'online' : 'offline'}`}>
        <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
        {connected ? 'Connected' : 'No Device'}
      </div>
    </div>
  )
}
