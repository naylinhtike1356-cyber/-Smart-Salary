package com.naylinhtike.salarytracker

import android.graphics.BitmapFactory
import android.util.Base64
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject

/**
 * Android-local Korean payslip OCR. No image is uploaded to a remote OCR service.
 * Extracted numbers are untrusted suggestions until the person reviews them.
 */
object PayslipTextRecognition {
    fun recognize(dataUrl: String, complete: (Result<JSONObject>) -> Unit) {
        try {
            require(dataUrl.length < 18_000_000) { "Payslip photo is too large" }
            require(Regex("^data:image/(jpeg|png|webp);base64,", RegexOption.IGNORE_CASE)
                .containsMatchIn(dataUrl)) { "Unsupported photo format" }
            val encoded = dataUrl.substringAfter(',')
            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            require(bytes.size <= 12_000_000) { "Payslip photo exceeds size limit" }
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: error("Could not decode payslip photo")
            val image = InputImage.fromBitmap(bitmap, 0)
            val recognizer = TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
            recognizer.process(image)
                .addOnSuccessListener { result ->
                    val lines = JSONArray()
                    for (block in result.textBlocks) {
                        for (line in block.lines) {
                            val rect = line.boundingBox
                            lines.put(JSONObject()
                                .put("text", line.text)
                                .put("left", rect?.left ?: 0)
                                .put("top", rect?.top ?: 0)
                                .put("right", rect?.right ?: 0))
                        }
                    }
                    complete(Result.success(JSONObject()
                        .put("text", result.text)
                        .put("imageWidth", bitmap.width)
                        .put("imageHeight", bitmap.height)
                        .put("lines", lines)))
                    recognizer.close()
                }
                .addOnFailureListener { error ->
                    complete(Result.failure(error))
                    recognizer.close()
                }
        } catch (error: Exception) {
            complete(Result.failure(error))
        }
    }
}
