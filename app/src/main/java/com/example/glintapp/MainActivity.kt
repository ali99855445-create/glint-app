package com.example.glintapp

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val textView = TextView(this)
        textView.text = "Welcome to Glint App!\nConnecting to http://187.77.82.145:5000"
        textView.textSize = 20f
        textView.setPadding(40, 40, 40, 40)
        
        setContentView(textView)
    }
}
