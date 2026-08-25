import Link from 'next/link';
import { HarinPictogram } from '../_design-system/harin-ui.js';
import styles from './execution-learning-loop.module.css';

export default function ExecutionLearningLoop({model,activeView}){
  return <nav className={styles.loop} data-core-visualization="execution-learning-loop" aria-label="진단에서 실험까지 실행 학습 흐름">
    <ol>
      {model.steps.map((step,index)=><li data-tone={step.tone} data-evidence={step.evidence_status} key={step.id}>
        <Link className={activeView===step.id?styles.active:''} href={step.href} aria-current={activeView===step.id?'step':undefined}>
          <HarinPictogram icon={step.icon} tone={step.tone} size={19}/>
          <span><b>{step.label}</b><small>{step.description}</small></span>
          <em>{step.display}</em>
        </Link>
        {index<model.steps.length-1?<i aria-hidden="true">→</i>:null}
      </li>)}
    </ol>
    {model.has_missing_evidence?<p>아직 읽지 못한 단계는 0건으로 바꾸지 않고 확인 필요로 표시합니다.</p>:null}
  </nav>;
}
