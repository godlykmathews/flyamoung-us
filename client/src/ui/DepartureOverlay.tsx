import './departure.css';
export function DepartureOverlay({onComplete}:{onComplete:()=>void}) {
 return <section className="departure-overlay" aria-label="Flight departure animation">
  <span className="departure-brand">FLIGHT 404</span>
  <div className="departure-caption"><p>En route.</p><div className="departure-progress"/></div>
  <button onClick={onComplete}>Enter cabin</button>
 </section>;
}
