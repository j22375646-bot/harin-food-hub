import styles from './primitives.module.css';

export function Phase28PageHeading({context,title,accent,suffix='',summary}) {
  return <header className={styles.heading}>
    <div className={styles.context}><i aria-hidden="true"/>{context}</div>
    <h1>{title}<em className={`page-title-accent ${styles.headingAccent}`}>{accent}</em>{suffix}</h1>
    <p>{summary}</p>
  </header>;
}
