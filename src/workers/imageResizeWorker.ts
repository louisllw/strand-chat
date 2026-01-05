self.onmessage = async (event: MessageEvent) => {
  const { buffer, type, maxDimension, quality, thumbnailMaxDimension } = event.data as {
    buffer: ArrayBuffer;
    type: string;
    maxDimension: number;
    quality: number;
    thumbnailMaxDimension?: number;
  };
  try {
    const blob = new Blob([buffer], { type });
    const bitmap = await createImageBitmap(blob);
    const maxSize = Math.max(bitmap.width, bitmap.height);
    const outputType = type === 'image/png' ? 'image/png' : 'image/jpeg';
    const createResizedBlob = async (targetWidth: number, targetHeight: number) => {
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas unavailable');
      }
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      return canvas.convertToBlob({
        type: outputType,
        quality: outputType === 'image/jpeg' ? quality : undefined,
      });
    };

    let outputBuffer = buffer;
    let outputWidth = bitmap.width;
    let outputHeight = bitmap.height;
    if (maxSize > maxDimension) {
      const scale = maxDimension / maxSize;
      const targetWidth = Math.round(bitmap.width * scale);
      const targetHeight = Math.round(bitmap.height * scale);
      const resizedBlob = await createResizedBlob(targetWidth, targetHeight);
      outputBuffer = await resizedBlob.arrayBuffer();
      outputWidth = targetWidth;
      outputHeight = targetHeight;
    }

    let thumbnailBuffer: ArrayBuffer | undefined;
    let thumbnailWidth: number | undefined;
    let thumbnailHeight: number | undefined;
    if (thumbnailMaxDimension && thumbnailMaxDimension > 0 && maxSize > thumbnailMaxDimension) {
      const scale = thumbnailMaxDimension / maxSize;
      const targetWidth = Math.round(bitmap.width * scale);
      const targetHeight = Math.round(bitmap.height * scale);
      const thumbBlob = await createResizedBlob(targetWidth, targetHeight);
      thumbnailBuffer = await thumbBlob.arrayBuffer();
      thumbnailWidth = targetWidth;
      thumbnailHeight = targetHeight;
    } else if (thumbnailMaxDimension && thumbnailMaxDimension > 0) {
      const originalBuffer = await blob.arrayBuffer();
      thumbnailBuffer = originalBuffer;
      thumbnailWidth = bitmap.width;
      thumbnailHeight = bitmap.height;
    }
    bitmap.close();
    self.postMessage(
      {
        buffer: outputBuffer,
        type: maxSize > maxDimension ? outputType : type,
        resized: maxSize > maxDimension,
        width: outputWidth,
        height: outputHeight,
        thumbnailBuffer,
        thumbnailType: outputType,
        thumbnailWidth,
        thumbnailHeight,
      },
      { transfer: thumbnailBuffer ? [outputBuffer, thumbnailBuffer] : [outputBuffer] }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resize failed';
    self.postMessage({ error: message });
  }
};
