'use strict';

function selectPhase28Root(renderMode) {
  return renderMode==='full'||renderMode==='preview'?'phase28':'legacy';
}

module.exports={selectPhase28Root};
