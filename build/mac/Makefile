TARGET = trapram-semunlink

all: $(TARGET)

$(TARGET): semunlink.c
	cc -arch arm64 -O2 -o $@.arm64 $<
	cc -arch x86_64 -O2 -o $@.x86_64 $<
	lipo -create -output $@ $@.arm64 $@.x86_64
	rm -f $@.arm64 $@.x86_64
	codesign --force --sign - $@

clean:
	rm -f $(TARGET) $(TARGET).arm64 $(TARGET).x86_64
