import { Composition } from 'remotion'
import { KokoPreview, TOTAL } from './KokoPreview'

export function Root() {
  return (
    <Composition
      id="KokoPreview"
      component={KokoPreview}
      durationInFrames={TOTAL}
      fps={30}
      width={1080}
      height={1920}
    />
  )
}
