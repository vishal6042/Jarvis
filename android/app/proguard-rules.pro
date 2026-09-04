# kotlinx.serialization — keep generated serializers
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.jarvis.sync.data.** {
    *** Companion;
}
-keepclasseswithmembers class com.jarvis.sync.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}
