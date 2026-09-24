interface Props {
  onClick: () => void;
  loading: boolean;
}

export function LoadMore({ onClick, loading }: Props) {
  return (
    <button type="button" className="load-more" onClick={onClick} disabled={loading}>
      {loading ? 'Loading…' : 'Load more'}
    </button>
  );
}
