import { UMAP } from 'umap-js'

export async function reduceToTwoD(
  vectors: number[][],
): Promise<Array<[number, number]>> {
  if (vectors.length === 0) return []
  if (vectors.length < 4) {
    return vectors.map((_, i) => [i, 0] as [number, number])
  }

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, vectors.length - 1),
    minDist: 0.1,
    nEpochs: 200,
  })

  const result = umap.fit(vectors)
  return result as Array<[number, number]>
}
