/**
 * 向量工具类
 */

export class VectorUtils {
  /**
   * 余弦相似度
   */
  static cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimension');
    }

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

    return dotProduct / (mag1 * mag2);
  }

  /**
   * 欧氏距离
   */
  static euclideanDistance(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimension');
    }

    const sum = vec1.reduce((acc, val, i) => acc + Math.pow(val - vec2[i], 2), 0);
    return Math.sqrt(sum);
  }

  /**
   * 向量标准化
   */
  static normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / magnitude);
  }

  /**
   * 向量加法
   */
  static add(vec1: number[], vec2: number[]): number[] {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimension');
    }
    return vec1.map((val, i) => val + vec2[i]);
  }

  /**
   * 向量减法
   */
  static subtract(vec1: number[], vec2: number[]): number[] {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimension');
    }
    return vec1.map((val, i) => val - vec2[i]);
  }

  /**
   * 标量乘法
   */
  static scale(vector: number[], scalar: number): number[] {
    return vector.map((val) => val * scalar);
  }
}




























































