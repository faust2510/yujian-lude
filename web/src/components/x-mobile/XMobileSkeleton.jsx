export function XMobileSkeleton({ lines = 3 }) { return <div className="x-mobile-skeleton" aria-label="加载中">{Array.from({ length: lines }, (_, index) => <span key={index} />)}</div> }
